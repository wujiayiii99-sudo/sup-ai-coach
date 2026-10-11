import { createContext, useContext, useState, type ReactNode } from "react";

/** 学生身份，来自 Supabase students 表 */
export interface Student {
  id: string;
  student_no: string;
  name: string;
}

interface StudentContextValue {
  student: Student | null;
  saveStudent: (student: Student) => void;
  clearStudent: () => void;
}

const STORAGE_KEY = "sup_student";

const StudentContext = createContext<StudentContextValue | null>(null);

function readStudentFromStorage(): Student | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Student;
    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.student_no === "string" &&
      typeof parsed.name === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function StudentProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(() =>
    readStudentFromStorage()
  );

  const saveStudent = (next: Student) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setStudent(next);
  };

  const clearStudent = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStudent(null);
  };

  return (
    <StudentContext.Provider value={{ student, saveStudent, clearStudent }}>
      {children}
    </StudentContext.Provider>
  );
}

export function useStudent(): StudentContextValue {
  const ctx = useContext(StudentContext);
  if (!ctx) throw new Error("useStudent 必须在 StudentProvider 内使用");
  return ctx;
}
