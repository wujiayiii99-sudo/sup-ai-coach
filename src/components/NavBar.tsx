import { NavLink, useNavigate } from "react-router-dom";
import { MODULES } from "../lib/modules";
import { useStudent } from "../contexts/StudentContext";

export default function NavBar() {
  const { student, clearStudent } = useStudent();
  const navigate = useNavigate();

  const handleSwitch = () => {
    clearStudent();
    navigate("/setup");
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">桨板课后教学平台</div>
      <div className="navbar-links">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `navbar-link ${isActive ? "active" : ""}`}
        >
          首页
        </NavLink>
        {MODULES.map((m) => (
          <NavLink
            key={m.no}
            to={m.path}
            className={({ isActive }) =>
              `navbar-link ${isActive ? "active" : ""}`
            }
          >
            {m.navLabel}
          </NavLink>
        ))}
      </div>
      {student && (
        <div className="navbar-user">
          <span className="navbar-name">{student.name}</span>
          <button className="navbar-switch" onClick={handleSwitch}>
            切换学生
          </button>
        </div>
      )}
    </nav>
  );
}
