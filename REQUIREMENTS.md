我要把当前项目升级为桨板课后教学平台，分 3 期实施。现在做第一期。

项目背景
React 19 + TypeScript + Vite

现有功能：桨板直线划行 AI 姿态评分（MediaPipe）

已配置 Supabase，.env 里有 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY

Supabase 已有 5 张表：students、module_progress、quiz_scores、practice_scores、page_views

第一期目标
搭建基础框架，不涉及具体内容，先把骨架跑通。

任务 1：装依赖
安装 react-router-dom、@supabase/supabase-js。

任务 2：建 Supabase 客户端
新建 src/lib/supabase.ts，从环境变量初始化 Supabase 客户端。

任务 3：建路由结构
用 react-router-dom 建立路由：

/ → 首页（课程地图）

/setup → 学生首次进入填学号姓名

/module/1 → 模块1（占位）

/module/2 → 模块2（占位）

/module/3 → 模块3（占位）

/module/4 → 模块4（现有 AI 评分功能）

/teacher/login → 教师登录（占位）

/teacher/dashboard → 教师后台（占位）

任务 4：学生身份系统
新建 src/contexts/StudentContext.tsx，用 React Context 管理学生身份

新建 src/pages/StudentSetup.tsx：首次进入填学号 + 姓名，写入 Supabase students 表（学号已存在则更新 last_seen_at 并读取信息）

学生身份存 localStorage，key 为 sup_student

未填写身份的学生，访问任何页面都自动跳 /setup

已填写的跳过 /setup

任务 5：主布局
新建 src/layouts/MainLayout.tsx：顶部导航（4 模块 + 首页）+ 内容区

新建 src/components/NavBar.tsx

任务 6：首页课程地图
新建 src/pages/Home.tsx：4 个模块卡片，显示模块名、简介、学习状态（从 module_progress 读）

点击卡片进入对应模块

任务 7：挪现有评分功能
把 App.tsx 里核心评分逻辑（摄像头、MediaPipe、评分）抽成组件

放到 /module/4 页面

不要改动 poseDetector.ts、poseMetrics.ts、bodyStroke/ 等核心算法文件

现有功能必须能正常工作

任务 8：页面访问记录
每次进入一个页面，往 page_views 表插一条记录（student_id、page_path）

要求
每完成一个任务，本地 npm run dev 验证能跑

全部做完后告诉我怎么测试

样式简洁，不引入 UI 库

全部 TypeScript，类型安全

请先告诉我你的实施计划，再开始动手。