import QuizRunner from "../../components/QuizRunner";
import { module1Quiz } from "../../data/module1-quiz";

export default function Module1Quiz() {
  return (
    <QuizRunner
      title="模块 1 测验"
      questions={module1Quiz}
      moduleNo={1}
      backPath="/module/1"
    />
  );
}
