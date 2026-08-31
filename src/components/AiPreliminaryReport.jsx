import { buildAiReportView } from "../lib/aiReportView.js";

function ReportList({ items, emptyText }) {
  if (items.length === 0) return <p className="ai-report-empty">{emptyText}</p>;
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function FinancingAssessment({ item }) {
  return (
    <article className="ai-financing-card">
      <dl className="ai-financing-metrics">
        <div><dt>参考额度</dt><dd>{item.amountLabel}</dd></div>
        <div><dt>参考期限</dt><dd>{item.termLabel}</dd></div>
        <div><dt>参考定价</dt><dd>{item.pricingLabel}</dd></div>
        <div><dt>判断参考</dt><dd>{item.confidenceLabel}</dd></div>
      </dl>
      <section>
        <h4>区间形成原因</h4>
        <ReportList items={item.reasons} emptyText="当前资料支持进一步评估该融资方向。" />
      </section>
      <section>
        <h4>需关注风险</h4>
        <ReportList items={item.risks} emptyText="暂无额外风险提示。" />
      </section>
      <section>
        <h4>仍需确认</h4>
        <ReportList items={item.itemsToConfirm} emptyText="暂无额外确认事项。" />
      </section>
    </article>
  );
}

export function AiPreliminaryReport({ report }) {
  const view = buildAiReportView(report);
  if (view == null) return null;

  return (
    <section className="ai-preliminary-report" aria-labelledby="ai-report-title">
      <header className="ai-report-status">
        <div>
          <span className="ai-report-source">{view.sourceLabel}</span>
          <strong id="ai-report-title">{view.reviewLabel}</strong>
        </div>
        <p>{view.statusMessage}</p>
      </header>

      <section className="ai-report-business" aria-labelledby="ai-business-title">
        <span>01</span>
        <div>
          <h3 id="ai-business-title">经营判断</h3>
          <ReportList items={view.businessSummary} emptyText="当前经营判断以产品规则匹配结果为准。" />
        </div>
      </section>

      <section className="ai-financing-assessment" aria-labelledby="ai-financing-title">
        <span>02</span>
        <div>
          <h3 id="ai-financing-title">AI 参考融资能力</h3>
          {view.financingAssessment.length > 0 ? (
            <div className="ai-financing-grid">
              {view.financingAssessment.map((item) => <FinancingAssessment key={item.productId} item={item} />)}
            </div>
          ) : (
            <p className="ai-report-empty">当前报告暂未形成可量化的参考融资区间。</p>
          )}
        </div>
      </section>

      <section className="ai-report-sensitivity" aria-labelledby="ai-sensitivity-title">
        <span>03</span>
        <div>
          <h3 id="ai-sensitivity-title">敏感性分析</h3>
          <ReportList
            items={[...new Set(view.financingAssessment.flatMap((item) => item.sensitivities))]}
            emptyText="补齐经营资料后，可进一步明确参考融资区间。"
          />
        </div>
      </section>

      <section className="ai-report-actions" aria-labelledby="ai-actions-title">
        <span>04</span>
        <div>
          <h3 id="ai-actions-title">融资准备清单</h3>
          <ReportList items={view.preparationActions} emptyText="暂无额外资料准备建议。" />
        </div>
      </section>

      <p className="ai-report-privacy">{view.privacyNotice}</p>
    </section>
  );
}
