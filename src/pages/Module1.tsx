import ModuleArticle from "../components/ModuleArticle";
import { module1Content } from "../data/module1-content";
import { VIDEOS } from "../data/videos";

export default function Module1() {
  return (
    <ModuleArticle
      title="桨板的基本构造与相关配件的功能介绍"
      bannerImage="/images/photos/module1-1.jpg"
      sections={module1Content}
      video={VIDEOS[0]}
      quizPath="/module/1/quiz"
    />
  );
}
