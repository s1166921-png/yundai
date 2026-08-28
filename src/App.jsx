import { useEffect, useMemo, useState } from "react";
import fundingNetwork from "./assets/funding-network.jpg";
import policyCycle from "./assets/policy-cycle.svg";
import policyPrepay from "./assets/policy-prepay.svg";
import policyRate from "./assets/policy-rate.svg";
import policyTerm from "./assets/policy-term.svg";
import { FinancingIntake } from "./components/FinancingIntake";
import { ProductMatchCenter } from "./components/ProductMatchCenter";
import { getJson } from "./lib/http/jsonRequest.js";
import { scrollProductMatchCenterIntoView } from "./lib/productMatchView.js";

const commonAdvantages = [
  ["2000万", "最高可贷额度"],
  ["低至3%", "综合费率"],
  ["最长1年", "灵活授信期限"],
  ["循环授信", "随用随贷"],
];

const products = [
  {
    name: "货押贷",
    tag: "盘活在库 + 在途货物",
    headline: "把沉睡库存变成流动资金",
    limit: "最高 2000 万元",
    period: "最长 1 年",
    bullets: [
      "以美鸥监管的在途货物、在仓库存质押融资",
      "出口满 1 年及以上，货值质押率最高 80%",
      "出口 3 个月至 1 年，货值质押率最高 60%",
      "受托支付结清仓储物流费用，剩余资金自主支配",
      "额度循环可用，适配备货、物流与旺季扩张",
    ],
  },
  {
    name: "应收贷",
    tag: "盘活平台店铺回款",
    headline: "提前释放平台账期里的现金流",
    limit: "最高 2000 万元",
    period: "综合费率低至 3%",
    bullets: [
      "依托亚马逊、Temu、TikTok Shop 店铺真实回款授信",
      "授信额度按近 3 个月月均平台回款与动态系数核定",
      "放款采用自主支付，备货、广告、新品铺货都可使用",
      "一次授信、循环使用，无需反复提交资料",
      "支持提前还款，无提前还款违约金",
    ],
  },
];

const heroContent = {
  nav: "AI 融资准备助手",
  name: "美鸥云贷",
  badge: "MEIOU AI FINANCING INSIGHT",
  title: "用经营信息看清融资准备方向",
  subtitle: "美鸥云贷将企业经营、资金周转与资料准备串成一条清晰路径，快速生成参考融资区间、经营画像与下一步准备建议。",
  cta: "查看融资方案",
  altCta: "开始 AI 经营诊断",
};

const proofBadges = ["智能风控赋能", "最高 2000 万", "综合费率低至 3%", "最长授信 1 年", "循环授信随用随取", "提前还款无违约金"];

const coreAdvantages = [
  {
    index: "01",
    title: "大额额度充足",
    metric: "最高 2000 万",
    body: "覆盖采购备货、店铺运营、海外推广、仓储物流等全场景资金需求，支撑企业突破资金瓶颈、扩大经营规模。",
  },
  {
    index: "02",
    title: "超低费率成本",
    metric: "低至 3%",
    body: "依托美鸥智能大数据风控系统精准把控风险，优化融资成本结构，降低企业资金使用成本。",
  },
  {
    index: "03",
    title: "期限灵活可控",
    metric: "最长 1 年",
    body: "适配跨境回款周期不固定、淡旺季差异大的经营特点，按订单回款与资金流转节奏规划用款周期。",
  },
  {
    index: "04",
    title: "循环授信可用",
    metric: "随用随贷",
    body: "一次授信、循环使用，授信有效期内无需重复提交资料或重复审核，高效满足频繁周转需求。",
  },
  {
    index: "05",
    title: "提前还款无违约金",
    metric: "自由还款",
    body: "支持企业根据回款与现金流情况随时提前还款，不为闲置额度或提前回款承担额外成本。",
  },
];

const policyHighlights = [
  {
    key: "rate",
    title: "费率低至 3%",
    image: policyRate,
    imageAlt: "低费率融资成本下降概念图",
    body: "浦发对公宁波地区低至 3%，广发对公低至 4%，相比传统贷款利率优势显著。",
    action: "点击申请",
  },
  {
    key: "term",
    title: "期限灵活",
    image: policyTerm,
    imageAlt: "三到九个月灵活期限阶梯概念图",
    body: "最短 3 个月，最长 9 个月（微众对公），可按业务周期灵活选择。",
    action: "查看周期",
  },
  {
    key: "cycle",
    title: "额度可循环",
    image: policyCycle,
    imageAlt: "授信额度循环使用概念图",
    body: "额度循环使用，随借随还，适配旺季备货和日常周转。",
    action: "了解额度",
  },
  {
    key: "prepay",
    title: "提前还款",
    image: policyPrepay,
    imageAlt: "提前还款无违约金概念图",
    body: "支持根据回款节奏提前还款，无提前还款违约金，减少闲置资金成本。",
    action: "咨询方案",
  },
];

const applicationSteps = [
  ["01", "店铺授权", "通过 Amazon Seller Central 完成店铺授权"],
  ["02", "提交申请", "上传企业及董事资料，完成线上申请"],
  ["03", "银行审批", "银行对资料进行审核及授信审批"],
  ["04", "支用放款", "发起支用，资金直达大陆对公账户"],
];

function useScrollReveal() {
  useEffect(() => {
    const revealNodes = Array.from(document.querySelectorAll("[data-reveal]"));

    if (!revealNodes.length) {
      return undefined;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealNodes.forEach((node) => node.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -10% 0px" },
    );

    revealNodes.forEach((node, index) => {
      node.style.setProperty("--reveal-delay", `${Math.min(index % 7, 5) * 70}ms`);
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="nav">
      <a className="brand meiou" href="#top" aria-label="Meiou Cloud Loan home">
        <span className="brand-mark">M</span>
        <span>美鸥云贷</span>
      </a>
      <button
        className="menu-button"
        type="button"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav className={menuOpen ? "nav-links open" : "nav-links"} aria-label="Site navigation">
        <a className="active" href="#top">首页</a>
        <a href="#ai-diagnosis">AI 诊断</a>
        <a href="#access">准入流程</a>
        <a href="#products">产品卖点</a>
        <a href="#contact">立即咨询</a>
      </nav>
      <div className="nav-actions">
        <a className="ghost-button" href="#products">产品卖点</a>
        <a className="hot-button small" href="#contact">立即咨询</a>
      </div>
    </header>
  );
}

function HeroVisual() {
  return (
    <aside className="command-center cloud-loan" aria-label="Meiou cloud loan command center">
      <div className="panel-header">
        <span>AI 经营诊断中枢</span>
        <strong>LIVE</strong>
        <button type="button">经营视图</button>
      </div>
      <div className="map-stage">
        <img src={fundingNetwork} alt="Cross-border funding network" decoding="async" fetchPriority="high" />
        <div className="pulse-node primary" />
        <div className="pulse-node secondary" />
        <div className="pulse-node tertiary" />
      </div>
      <div className="signal-cards">
        <button className="signal-card active" type="button">
          <span>经营画像</span>
          <strong>已生成</strong>
          <small>识别经营阶段</small>
        </button>
        <button className="signal-card" type="button">
          <span>资金方向</span>
          <strong>已匹配</strong>
          <small>结合周转场景</small>
        </button>
        <button className="signal-card" type="button">
          <span>资料清单</span>
          <strong>待准备</strong>
          <small>提前减少反复沟通</small>
        </button>
        <button className="signal-card shield" type="button">
          <span>参考区间</span>
          <strong>可测算</strong>
          <small>规则透明可查</small>
        </button>
      </div>
    </aside>
  );
}

function ProofRibbon() {
  return (
    <section className="proof-ribbon" aria-label="Cloud loan proof points" data-reveal>
      <div className="ribbon-track">
        {[...proofBadges, ...proofBadges].map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function AiDiagnosticSection() {
  const steps = [
    ["01", "经营信息", "只填写影响产品判断的关键经营字段"],
    ["02", "产品规则核对", "按产品准入条件完成确定性匹配"],
    ["03", "AI 解释分析", "生成依据、待确认项与资料建议"],
    ["04", "顾问专业复核", "由融资顾问进一步确认适配方向"],
  ];
  const trustPoints = [
    ["有依据", "每个结论都有经营依据"],
    ["少暴露", "AI 仅分析脱敏经营字段"],
    ["有人负责", "结果由专业顾问进一步复核"],
  ];

  return (
    <section className="ai-diagnostic-section" aria-label="AI financing diagnostic" id="ai-diagnosis">
      <div className="ai-diagnostic-intro" data-reveal>
        <p className="eyebrow">AI financing diagnostic</p>
        <h2>先读懂经营，再匹配融资</h2>
        <p>AI 梳理企业经营信息，结合产品准入规则生成融资方向，由专业顾问进一步复核。</p>
      </div>
      <div className="ai-diagnostic-flow" data-reveal>
        {steps.map(([index, title, body], stepIndex) => (
          <div className="ai-flow-step" key={index}>
            <span>{index}</span>
            <i className={`flow-orbit orbit-${stepIndex + 1}`} aria-hidden="true" />
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>
      <div className="ai-trust-layout" data-reveal>
        <div className="ai-trust-points">
          {trustPoints.map(([title, body]) => (
            <section key={title}>
              <strong>{title}</strong>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <aside className="ai-example" aria-label="Amazon SC 分析示例">
          <span>示例 · Amazon SC</span>
          <dl>
            <div><dt>经营事实</dt><dd>单店近 12 个月 GMV 已提交</dd></div>
            <div><dt>产品方向</dt><dd>Amazon SC 卖家融资</dd></div>
            <div><dt>仍需确认</dt><dd>销售报告与回款账户安排</dd></div>
          </dl>
        </aside>
      </div>
      <a className="outline-button ai-diagnostic-action" href="#contact" data-reveal>开始 AI 融资分析</a>
    </section>
  );
}

function PolicyShowcase() {
  return (
    <section id="advantages" className="policy-showcase" aria-label="Cloud loan policy highlights">
      <div className="policy-inner">
        <div className="section-heading dark-heading" data-reveal>
          <p className="eyebrow">loan highlights</p>
          <h2>把低成本、灵活周期和循环额度讲清楚</h2>
          <p className="section-copy">
            参考银行产品页的信息表达，把客户最关心的费率、期限、额度使用方式拆成逐屏出现的重点模块。
          </p>
        </div>

        <div className="policy-stack">
          {policyHighlights.map((item, index) => (
            <article key={item.key} className={index % 2 === 1 ? "policy-row reverse" : "policy-row"} data-reveal>
              <div className={`policy-visual ${item.key}`}>
                <img src={item.image} alt={item.imageAlt} />
                <i />
                <i />
                <i />
              </div>
              <div className="policy-copy">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <a href="#contact">{item.action}</a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductPanel() {
  const [active, setActive] = useState(products[0].name);
  const selected = useMemo(() => products.find((product) => product.name === active) ?? products[0], [active]);

  return (
    <section id="products" className="products cloud-products">
      <div className="section-heading" data-reveal>
        <p className="eyebrow">product matrix</p>
        <h2>两类融资产品，覆盖跨境卖家核心资金场景</h2>
        <p className="section-copy">货押贷解决备货与库存占资，应收贷解决平台账期与轻资产授信。</p>
      </div>

      <div className="product-tabs" role="tablist" aria-label="Loan products" data-reveal>
        {products.map((product) => (
          <button
            key={product.name}
            className={active === product.name ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={active === product.name}
            onClick={() => setActive(product.name)}
          >
            {product.name}
          </button>
        ))}
      </div>

      <div className="loan-detail" data-reveal>
        <div className="loan-detail-main">
          <span>{selected.tag}</span>
          <h3>{selected.headline}</h3>
          <div className="loan-kpis">
            <strong>{selected.limit}</strong>
            <strong>{selected.period}</strong>
          </div>
        </div>
        <ul>
          {selected.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AdvantageEngine() {
  return (
    <section id="engine" className="advantage-engine" aria-label="Cloud loan core advantages">
      <div className="section-heading" data-reveal>
        <p className="eyebrow">core advantages</p>
        <h2>把融资能力做成一套可循环运转的资金引擎</h2>
        <p className="section-copy">
          美鸥风控把跨境经营数据转化为授信依据，让企业在备货、推广、物流、回款衔接中获得更低成本、更高灵活度的资金支持。
        </p>
      </div>
      <div className="advantage-grid">
        {coreAdvantages.map((item) => (
          <article key={item.index} className="advantage-card" data-reveal>
            <div className="advantage-topline">
              <span>{item.index}</span>
              <b>{item.metric}</b>
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
      <div className="capital-flow" aria-label="Data risk control flow" data-reveal>
        <div>
          <span>经营数据</span>
          <strong>店铺 / 物流 / 仓储 / 回款</strong>
        </div>
        <i />
        <div>
          <span>智能风控</span>
          <strong>授信画像与风险定价</strong>
        </div>
        <i />
        <div>
          <span>云贷额度</span>
          <strong>循环授信 / 随用随取</strong>
        </div>
      </div>
    </section>
  );
}

function AccessAndProcess({ report, products, aiReport }) {
  return (
    <section id="access" className="access-process" aria-label="Product matching and application process">
      <div className="access-inner">
        <ProductMatchCenter report={report} products={products} aiReport={aiReport} />

        <div className="process-panel">
          <div className="process-heading" data-reveal>
            <p className="eyebrow">申请流程</p>
            <h2>4 步完成申请，最快一周资金到账</h2>
            <p className="section-copy">从店铺授权到资金直达账户，全程线上协同。</p>
          </div>
          <div className="process-grid">
            {applicationSteps.map(([number, title, body]) => (
              <article key={number} className="process-step" data-reveal>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function App() {
  useScrollReveal();
  const [leadResult, setLeadResult] = useState(null);
  const [publicProducts, setPublicProducts] = useState(null);

  useEffect(() => {
    let active = true;
    getJson("/api/products").then(
      (payload) => {
        if (active) setPublicProducts(Array.isArray(payload?.products) ? payload.products : []);
      },
      () => {
        if (active) setPublicProducts([]);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const completeIntake = (lead) => {
    setLeadResult(lead);
    const scrollToResults = () => {
      const matchCenter = document.getElementById("product-match-center");
      scrollProductMatchCenterIntoView(matchCenter, window);
      matchCenter?.focus?.({ preventScroll: true });
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(scrollToResults);
    } else {
      window.setTimeout(scrollToResults, 0);
    }
  };

  return (
    <main className="site-shell template-command final-template">
      <div className="ambient-layer" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <Header />

      <section id="top" className="hero cloud-hero">
        <div className="hero-copy" data-reveal>
          <div className="template-status">
            <span>{heroContent.nav}</span>
            <strong>{heroContent.name}</strong>
          </div>
          <div className="ai-pill">
            <span>{heroContent.badge}</span>
            <b>跨境卖家专属资金解决方案</b>
          </div>
          <h1>
            {heroContent.title.split("，")[0]}
            <span>{heroContent.title.split("，").slice(1).join("，") || "专属融资护航跨境经营"}</span>
          </h1>
          <p className="hero-text">{heroContent.subtitle}</p>
          <div className="feature-strip" aria-label="Core advantages">
            <span>真实数据风控</span>
            <span>最高 2000 万</span>
            <span>综合费率低至 3%</span>
            <span>循环授信随用随取</span>
          </div>
          <div className="hero-actions">
            <a className="hot-button" href="#products">{heroContent.cta}</a>
            <a className="outline-button" href="#contact">{heroContent.altCta}</a>
          </div>
          <dl className="hero-metrics">
            {commonAdvantages.map(([value, label]) => (
              <div key={label}>
                <dt>{value}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div data-reveal="zoom">
          <HeroVisual />
        </div>
      </section>

      <ProofRibbon />

      <AiDiagnosticSection />

      <PolicyShowcase />

      <AdvantageEngine />

      <AccessAndProcess
        report={leadResult?.matchReport ?? null}
        products={publicProducts}
        aiReport={leadResult?.aiReport ?? null}
      />

      <ProductPanel />

      <section id="contact" className="lead-section cloud-cta">
        <div className="lead-copy" data-reveal>
          <p className="eyebrow">financing intake</p>
          <h2>提交关键经营信息，获取产品方向</h2>
          <p className="section-copy">
            系统会根据主要融资场景，只追问影响产品判断的关键信息。
          </p>
        </div>
        <FinancingIntake onComplete={completeIntake} onInvalidate={() => setLeadResult(null)} />
      </section>
    </main>
  );
}
