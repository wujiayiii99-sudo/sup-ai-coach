import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StudentProvider } from "./contexts/StudentContext";
import RequireStudent from "./components/RequireStudent";
import MainLayout from "./layouts/MainLayout";
import Home from "./pages/Home";
import StudentSetup from "./pages/StudentSetup";
import Module1 from "./pages/Module1";
import Module2 from "./pages/Module2";
import Module3 from "./pages/Module3";
import Module4 from "./pages/Module4";
import Module5 from "./pages/Module5";
import Module1Quiz from "./pages/module1/Quiz";
import Module3Quiz from "./pages/module3/Quiz";
import TeacherLogin from "./pages/TeacherLogin";
import TeacherDashboard from "./pages/TeacherDashboard";
import TurnDrawing from "./pages/demo/TurnDrawing";
import "./shell.css";

export default function App() {
  return (
    <StudentProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<StudentSetup />} />
          <Route path="/teacher/login" element={<TeacherLogin />} />
          <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
          <Route path="/demo/turn-drawing" element={<TurnDrawing />} />
          <Route element={<RequireStudent />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/module/1" element={<Module1 />} />
              <Route path="/module/1/quiz" element={<Module1Quiz />} />
              <Route path="/module/2" element={<Module2 />} />
              <Route path="/module/3" element={<Module3 />} />
              <Route path="/module/3/quiz" element={<Module3Quiz />} />
              <Route path="/module/4" element={<Module4 />} />
              <Route path="/module/5" element={<Module5 />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </StudentProvider>
  );
}
