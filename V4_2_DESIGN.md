# V4.2 五阶段划桨状态机 — 设计文档

> 日期：2026-07-13
> 基于 V4.1 实测数据（T3 左右侧动态划桨，300 帧，92-97% 指标覆盖）

---

## 1. 设计目标

基于 V4.1 的 20 项平滑指标，识别划桨动作的五个阶段，为后续的动作评价和计数提供时间对齐。

**不在 V4.2 范围内：**
- 动作质量评分（留给 V4.3）
- 实时训练反馈（留给 V4.4）

> **动作计数（strokeCount）在 V4.2 中实现**，因为状态机最清楚何时完成一个完整周期。V4.3 基于计数做评分。

---

## 2. 五阶段定义

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  准备     │ ──→ │  拉桨     │ ──→ │  推桨     │ ──→ │  恢复     │ ──→ │  暂停     │
│  Ready    │     │  Pull     │     │  Push     │     │  Recovery │     │  Pause    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
       ↑                                                            │
       └────────────────────────────────────────────────────────────┘
                  （暂停后回到准备开始下一桨）
```

| 阶段 | 描述 | 实测特征 |
|------|------|---------|
| **准备 (Ready)** | 双手握桨就位，桨叶在身体前方入水前 | 手静止或慢速移动，上手位置最高 |
| **拉桨 (Pull)** | 下手向后拉桨至髋部，躯干转体 | 方向角 ~±90°，合速度 >0.5 |
| **推桨 (Exit/Push)** | 下手出水、上手前推，桨叶离开水面 | 方向角变号，速度下降 |
| **恢复 (Recovery)** | 桨在空中向前摆动回准备位置 | 方向角反向 ~∓90°，速度 <0.5 |
| **暂停 (Pause)** | 动作间歇 | 所有速度接近零持续 >500ms |

---

## 3. 信号-阶段映射

### 3.1 驱动信号（来自 V4.1）

| V4.1 指标 | 用途 | 平滑源 |
|-----------|------|--------|
| `powerWristRelativeCompositeSpeed` | 主要：区分运动/静止 | ScalarTracker (EMA) |
| `powerWristRelativeDirectionDeg` | 主要：区分拉桨/恢复方向 | ScalarTracker (EMA) |
| `handSpanVelocity` | 辅助：手间距变化率 | ScalarTracker (EMA) |
| `shoulderHipProjectedAngleDiffDeg` | 辅助：转体幅度 | ScalarTracker (EMA) |
| `bodyCenterVerticalVelocity` | 辅助：身体起伏 | ScalarTracker (EMA) |
| `topPowerVerticalOffsetRatio` | 辅助：上手位置 | ScalarTracker (EMA) |

### 3.2 左右侧镜像处理

方向角 ±90° 分别表示"向下（拉桨）"和"向上（恢复）"，但左右侧划桨时上下手互换导致方向符号互换：

| 侧 | 拉桨方向 | 恢复方向 |
|----|---------|---------|
| 右侧 | ~+90° | ~-90° |
| 左侧 | ~-90° | ~+90° |

**状态机在初始化时接收 currentSide（right/left），将方向区间镜像映射：**
```
func getRanges(side):
  pullRange = side === "right" ? [45, 135] : [-135, -45]
  recoveryRange = side === "right" ? [-135, -45] : [45, 135]
  return pullRange, recoveryRange
```

### 3.3 阶段过渡条件

```
准备 → 拉桨：
  必要条件：
    - powerWristRelativeCompositeSpeed > 0.4 （开始主动运动）
    - 上一阶段非 Pull/已在运动中
  辅助条件（任一）：
    - powerWristRelativeDirectionDeg 进入 ±(45°,135°) 范围
    - handSpanVelocity 方向改变

拉桨 → 推桨：
  必要条件：
    - powerWristRelativeCompositeSpeed 从峰值下降 >30%
    - 拉桨持续 >300ms
  辅助条件：
    - powerWristRelativeDirectionDeg 变号（方向反转）
    - handSpanVelocity 变号（手间距从拉开变为收拢）

推桨 → 恢复：
  必要条件：
    - powerWristRelativeCompositeSpeed < 0.4
  辅助条件：
    - powerWristRelativeDirectionDeg 稳定在反向区域

恢复 → 准备：
  必要条件：
    - 恢复持续 >400ms
    - topPowerVerticalOffsetRatio 接近静止基线值
  辅助条件：
    - bodyCenterVerticalVelocity < 0.1

准备/恢复 → 暂停：
  必要条件：
    - 所有速度 < 0.2 持续 >800ms
```

---

## 4. 架构设计

### 4.1 文件结构

```
src/bodyStroke/
├── bodyStrokeTypes.ts       # + Phase 类型
├── bodyStrokeConfig.ts      # + Phase 阈值
├── bodyStrokePhases.ts      # [NEW] 五阶段状态机
└── bodyStrokeTracker.ts     # + phase 集成
```

### 4.2 bodyStrokePhases.ts 设计

```typescript
// ================================================================
// 类型
// ================================================================

export type StrokePhase =
  | "ready"
  | "pull"
  | "push"
  | "recovery"
  | "pause";

export interface PhaseState {
  phase: StrokePhase;
  durationMs: number;
  justTransitioned: boolean;
  confidence: number;
  phaseStartTime: number;
  strokeCount: number;
}

// ================================================================
// 配置
// ================================================================

export const PHASE_CONFIG = {
  pullEnterDebounceMs: 150,
  pullExitDebounceMs: 100,
  pushExitDebounceMs: 80,
  pauseEnterMs: 800,
  pullSpeedMin: 0.4,
  pushSpeedMax: 0.4,
  peakSpeedDropRatio: 0.3,
  recoveryMinDuration: 400,
  pauseSpeedThreshold: 0.2,
  pullDirectionRange: [45, 135],
  recoveryDirectionRange: [-135, -45],
  directionChangeMinDeg: 60,
} as const;

// ================================================================
// 状态机类
// ================================================================

export class StrokePhaseMachine {
  private _currentPhase: StrokePhase = "pause";
  private _phaseStartTime: number = 0;
  private _strokeCount: number = 0;
  private _pullPeakSpeed: number = 0;
  private _currentSide: StrokeSide = "right";

  // 时间基计数器（仿 V3 postureStabilizer）
  private _pullTimer = { okSince: 0, failSince: 0 };
  private _pushTimer = { okSince: 0, failSince: 0 };
  private _pauseTimer = { okSince: 0, failSince: 0 };

  constructor(side?: StrokeSide) { if (side) this._currentSide = side; }

  private _getRanges(): { pull: [number, number]; recovery: [number, number] } {
    const p = PHASE_CONFIG.pullDirectionRange;
    const r = PHASE_CONFIG.recoveryDirectionRange;
    if (this._currentSide === "right") {
      return { pull: [p[0], p[1]], recovery: [r[0], r[1]] };
    }
    return { pull: [r[0], r[1]], recovery: [p[0], p[1]] };
  }

  update(metrics: BodyStrokeMetrics, now: number, side?: StrokeSide): PhaseState { ... }
  reset(): void { ... }
}
```### 4.3 状态机核心逻辑（伪代码）

```
function update(metrics, now):
  speed = metrics.powerWristRelativeCompositeSpeed
  direction = metrics.powerWristRelativeDirectionDeg
  prevPhase = currentPhase

  switch (currentPhase):
    case "pause":
      if (speed > PHASE_CONFIG.pullSpeedMin):
        // 从静止开始运动 → 准备或直接拉桨
        if (direction 在拉桨范围):
          transitionTo("pull", now, speed)
        else:
          transitionTo("ready", now)
      break

    case "ready":
      if (speed > PHASE_CONFIG.pullSpeedMin 
          && direction 在拉桨范围 
          && 持续 > pullEnterDebounceMs):
        transitionTo("pull", now, speed)
      if (speed < PHASE_CONFIG.pauseSpeedThreshold 
          && 持续 > pauseEnterMs):
        transitionTo("pause", now)
      break

    case "pull":
      记录峰值速度
      if (速度从峰值下降 > PHASE_CONFIG.peakSpeedDropRatio
          && direction 不在拉桨范围
          && 持续 > pullExitDebounceMs):
        transitionTo("push", now)
      break

    case "push":
      if (speed < PHASE_CONFIG.pushSpeedMax
          && 持续 > pushExitDebounceMs):
        transitionTo("recovery", now)
      break

    case "recovery":
      if (speed < PHASE_CONFIG.pauseSpeedThreshold
          && 持续 > pauseEnterMs):
        transitionTo("pause", now)
      if (direction 在拉桨范围 && speed > pullSpeedMin):
        // 开始下一桨
        strokeCount++
        transitionTo("ready", now) // 或直接到 pull
      break

  return { phase, durationMs, justTransitioned, confidence, phaseStartTime, strokeCount }
```

---

## 5. 与 V4.1 的集成

`StrokeTracker.update()` 返回的 `BodyStrokeMetrics` 已包含所有平滑数据。V4.2 的 `StrokePhaseMachine.update()` 接收这些数据作为输入。

在 `App.tsx` 中集成方式：
```tsx
// 初始化
const phaseMachineRef = useRef(new StrokePhaseMachine());

// 每帧更新
const phaseState = phaseMachineRef.current.update(smoothed, now);

// 渲染
// 显示当前阶段 + 动作计数
```

---

## 6. 待实测验证项

| 项目 | 风险 | 验证方式 |
|------|------|---------|
| 方向角分区（拉桨/恢复）阈值 | 侧身时方向角偏移可能误判 | T3 左右侧数据验证 |
| 峰值速度下降比例 30% | 慢速划桨可能不触发 | 用 T3 数据回测 |
| 防抖时间 150ms | 太快/太慢的划桨可能错过 | T3 各帧时间戳分析 |
| 暂停 800ms | 连续快速划桨可能不进入暂停 | 实际测试 |

---

## 7. 实施顺序

1. **Step 1**: 在 `bodyStrokeTypes.ts` 添加 phase 类型
2. **Step 2**: 在 `bodyStrokeConfig.ts` 添加 phase 阈值
3. **Step 3**: 实现 `bodyStrokePhases.ts`（状态机类）
4. **Step 4**: 集成到 `App.tsx`（阶段显示 + 动作计数 UI）
5. **Step 5**: T3 数据回测验证
6. **Step 6**: 实物测试校准阈值
