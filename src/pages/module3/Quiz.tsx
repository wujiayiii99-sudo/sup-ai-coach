import QuizRunner from "../../components/QuizRunner";
import { module3Quiz } from "../../data/module3-quiz";

export default function Module3Quiz() {
  return (
    <QuizRunner
      title="模块 3 测验"
      questions={module3Quiz}
      moduleNo={3}
      backPath="/module/3"
    />
  );
}
