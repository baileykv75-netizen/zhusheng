import Link from "next/link";
import { ArrowDown, ArrowRight, CheckCircle2, MoveUpRight } from "lucide-react";
import { BuildingSectionFigure } from "./BuildingSectionFigure";

const promises = ["建造，不失忆", "居住，有回应", "经验，会生长"];

export function ConceptExhibit() {
  return <div className="concept-exhibit">
    <section className="concept-hero" id="concept">
      <div className="concept-hero-copy">
        <p className="concept-kicker">筑生 / 建筑具身智能样机</p>
        <h1>一栋房子不该在<br />交付那天失去记忆。</h1>
        <p className="concept-lead">筑生，让建造留下的经验，在它被居住的每一天继续发挥作用。</p>
        <Link href="/case-1602" className="concept-primary">进入1602验证舱 <ArrowRight size={18} /></Link>
        <p className="concept-caption"><ArrowDown size={14} /> 从建筑身体地图，走进一段已经跑通的真实闭环</p>
      </div>
      <div className="concept-hero-model"><BuildingSectionFigure active="memory" /><span>16F · 1602</span></div>
    </section>

    <section className="concept-promise" aria-label="筑生承诺">
      {promises.map((promise, index) => <article key={promise}><small>0{index + 1}</small><strong>{promise}</strong></article>)}
    </section>

    <section className="concept-meaning" id="meaning">
      <div><p className="concept-kicker">不是另一套工地平台</p><h2>把一栋建筑从“交付物”，<br />变成会被持续理解的生命体。</h2></div>
      <div className="meaning-copy"><p>中建海龙已有的MiC、BIM、数字交付与智慧建造，让房子在建造时具备可追溯的身体基础。筑生把这份基础延续到入住之后。</p><p>它不替人作决定；它让住户、工友、物业和企业在需要的时候，看见同一栋房子曾经发生过什么，以及下一步该由谁完成。</p></div>
    </section>

    <section className="concept-continuum" id="continuum">
      <header><p className="concept-kicker">一条不断线的建筑生命</p><h2>从工友的一次留痕，<br />到下一栋房子的更好建造。</h2></header>
      <div className="continuum-path">
        <article><span>建造时</span><h3>留下，而不是填完表就消失</h3><p>施工口述、照片和扫码经人工确认，成为具体空间与构件可引用的记忆。</p></article>
        <article><span>居住时</span><h3>回应，而不是从零描述问题</h3><p>异常观察回到同一份建筑记忆，定位、授权、维修和复验形成可验证闭环。</p></article>
        <article><span>回流时</span><h3>生长，而不是把个案冒充标准</h3><p>验证通过的个案只形成待人工评审的试点经验，让下一批房子有机会更好。</p></article>
      </div>
    </section>

    <section className="concept-proof" id="proof">
      <div className="proof-model"><BuildingSectionFigure compact active="unit" /></div>
      <div className="proof-copy"><p className="concept-kicker">已实现的落地证明</p><h2>1602卫生间<br />不是概念图。</h2><p>它连接了一条已经实现、可重放、可复验的闭环：工友施工证据 → 潮湿异常 → 人工授权 → 精准维修 → 维修后复验 → 试点经验。</p><ul><li><CheckCircle2 size={17} />建筑记忆和构件拓扑来自同一事实源</li><li><CheckCircle2 size={17} />阀门动作保留住户或物业的独立授权</li><li><CheckCircle2 size={17} />经验只能进入人工评审后的PILOT_ONLY试点</li></ul><Link href="/case-1602" className="concept-secondary">查看1602完整验证 <MoveUpRight size={16} /></Link></div>
    </section>

    <footer className="concept-footer"><span>筑生 / 一栋房子一生的具身智能体</span><span>脱敏合成演示 · 不作为施工依据</span></footer>
  </div>;
}
