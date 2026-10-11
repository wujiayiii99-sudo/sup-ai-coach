import ModuleArticle from "../components/ModuleArticle";
import { module1Content } from "../data/module1-content";
import { VIDEOS } from "../data/videos";

export default function Module1() {
  return (
    <ModuleArticle
      title="模块 1 · 认识桨板"
      sections={module1Content}
      video={VIDEOS[0]}
      quizPath="/module/1/quiz"
    />
  );
}
