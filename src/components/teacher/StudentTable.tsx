import { useMemo, useState } from "react";
import { MODULE_STATUS_LABEL, type ModuleStatus } from "../../lib/modules";
import { formatDateTime } from "../../lib/format";

export interface StudentRow {
  id: string;
  studentNo: string;
  name: string;
  firstVisit: string | null;
  lastActive: string | null;
  status1: ModuleStatus;
  status2: ModuleStatus;
  status3: ModuleStatus;
  status4: ModuleStatus;
  status5: ModuleStatus;
  quiz1: { score: number; total: number } | null;
  quiz3: { score: number; total: number } | null;
  quiz5: { score: number; total: number } | null;
  practiceCount: number;
}

type SortKey = "studentNo" | "lastActive" | "status1";
const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: ModuleStatus }) {
  return (
    <span className={`module-status module-status-${status}`}>
      {MODULE_STATUS_LABEL[status]}
    </span>
  );
}

/** 学生清单表格：搜索 + 排序 + 分页（每页 20 条） */
export default function StudentTable({ rows }: { rows: StudentRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("studentNo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.studentNo.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const cmp = (() => {
        if (sortKey === "studentNo") {
          return a.studentNo.localeCompare(b.studentNo, undefined, {
            numeric: true,
          });
        }
        if (sortKey === "lastActive") {
          const ta = a.lastActive ? new Date(a.lastActive).getTime() : 0;
          const tb = b.lastActive ? new Date(b.lastActive).getTime() : 0;
          return ta - tb;
        }
        const order: ModuleStatus[] = ["completed", "in_progress", "not_started"];
        return order.indexOf(a.status1) - order.indexOf(b.status1);
      })();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="student-table">
      <div className="student-table-toolbar">
        <input
          className="student-table-search"
          type="text"
          placeholder="按学号或姓名搜索"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <span className="student-table-count">共 {sorted.length} 人</span>
      </div>

      <div className="table-wrap">
        <table className="teacher-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort("studentNo")}>
                学号{sortArrow("studentNo")}
              </th>
              <th>姓名</th>
              <th>首次访问</th>
              <th className="sortable" onClick={() => toggleSort("lastActive")}>
                最后活跃{sortArrow("lastActive")}
              </th>
              <th className="sortable" onClick={() => toggleSort("status1")}>
                模块1{sortArrow("status1")}
              </th>
              <th>模块2</th>
              <th>模块3</th>
              <th>模块4</th>
              <th>模块5</th>
              <th>模块1测验</th>
              <th>模块3测验</th>
              <th>模块5测验</th>
              <th>模块4练习</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <td>{r.studentNo}</td>
                <td>{r.name}</td>
                <td>{formatDateTime(r.firstVisit)}</td>
                <td>{formatDateTime(r.lastActive)}</td>
                <td>
                  <StatusBadge status={r.status1} />
                </td>
                <td>
                  <StatusBadge status={r.status2} />
                </td>
                <td>
                  <StatusBadge status={r.status3} />
                </td>
                <td>
                  <StatusBadge status={r.status4} />
                </td>
                <td>
                  <StatusBadge status={r.status5} />
                </td>
                <td>{r.quiz1 ? `${r.quiz1.score}/${r.quiz1.total}` : "—"}</td>
                <td>{r.quiz3 ? `${r.quiz3.score}/${r.quiz3.total}` : "—"}</td>
                <td>{r.quiz5 ? `${r.quiz5.score}/${r.quiz5.total}` : "—"}</td>
                <td>{r.practiceCount}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={13} className="table-empty">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="student-table-pagination">
          <button
            className="btn-secondary"
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            上一页
          </button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <button
            className="btn-secondary"
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
