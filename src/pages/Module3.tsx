import ModuleArticle from "../components/ModuleArticle";
import { module3Content } from "../data/module3-content";
import { VIDEOS } from "../data/videos";

export default function Module3() {
  return (
    <ModuleArticle
      title="模块 3 · 水上安全"
      sections={module3Content}
      video={VIDEOS[1]}
      quizPath="/module/3/quiz"
    />
  );
}
