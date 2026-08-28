import { buildAiReportView } from "../lib/aiReportView.js";

function ReportList({ items, emptyText }) {
  if (items.length === 0) return <p className="ai-report-empty">{emptyText}</p>;
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
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

      <section className="ai-report-products" aria-label="产品解释">
        {view.productExplanations.map((explanation, index) => (
          <article className="ai-report-product" key={explanation.productId}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <section>
              <h3>为什么匹配</h3>
              <ReportList items={explanation.reasons} emptyText="当前采用产品规则匹配依据。" />
            </section>
            <section>
              <h3>仍需确认</h3>
              <ReportList items={explanation.itemsToConfirm} emptyText="暂无额外待确认项。" />
            </section>
          </article>
        ))}
      </section>

      <section className="ai-report-actions" aria-labelledby="ai-actions-title">
        <span>02</span>
        <div>
          <h3 id="ai-actions-title">融资准备清单</h3>
          <ReportList items={view.preparationActions} emptyText="暂无额外资料准备建议。" />
        </div>
      </section>

      <p className="ai-report-privacy">{view.privacyNotice}</p>
    </section>
  );
}
