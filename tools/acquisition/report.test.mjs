import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReport, reportSql } from "./report.mjs";
import { campaignLink } from "./link.mjs";

test("report separates activity from mature cohorts and reads only bounded daily aggregates", async () => {
	const db = new DatabaseSync(":memory:");
	try {
		const dir = new URL("../../web/migrations/", import.meta.url);
		for (const name of (await readdir(dir)).filter(name => name.endsWith(".sql")).sort()) db.exec(await readFile(new URL(name, dir), "utf8"));
		const insert = db.prepare("INSERT INTO acquisition_daily (day, source, medium, campaign, content, landing, new_visitors, converted_24h, first_answers, returned_7d) VALUES (?, 'x', 'organic_social', 'trial', 'post-01', '/', ?, ?, ?, ?)");
		insert.run("2026-10-01", 100, 30, 30, 10);
		insert.run("2026-10-09", 20, 10, 10, 5); // Conversion mature, return still observing.
		insert.run("2026-10-10", 10, 5, 5, 1); // Neither whole-day cohort has matured.
		const options = { from: "2026-10-01", to: "2026-10-10", now: new Date("2026-10-11T00:00:00+09:00") };
		const sql = reportSql(options);
		const rows = db.prepare(sql).all();
		assert.deepEqual({ ...rows[0] }, { source: "x", medium: "organic_social", campaign: "trial", content: "post-01", landing: "/", new_visitors: 130, first_answers: 45, mature_visitors: 120, converted_24h: 40, mature_first_answers: 30, returned_7d: 10 });
		const output = formatReport(rows, options);
		assert(output.includes("33.3%（40/120）"));
		assert(output.includes("33.3%（10/30）"));
		const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map(r => r.detail).join(" ");
		assert.match(plan, /SEARCH acquisition_daily .*day>/);
		assert(!sql.includes("FROM answers"));
		assert(!sql.includes("acquisition_visitors"));
	} finally { db.close(); }
});

test("empty reports show observation pending instead of a misleading zero-percent rate", () => {
	const report = formatReport([], { from: "2026-10-01", to: "2026-10-05", now: new Date("2026-10-05T00:00:00Z") });
	assert(report.includes("観測待ち"));
	assert(report.includes("初回回答者: 0"));
});

test("invalid or unbounded report periods cannot reach SQL", () => {
	for (const options of [{ from: "2026-02-30", to: "2026-03-01" }, { from: "2026-10-05", to: "2026-10-01" }, { from: "2026-01-01", to: "2026-10-01" }, { from: "2026-10-01' OR 1=1", to: "2026-10-05" }]) assert.throws(() => reportSql(options));
});

test("campaign links preserve game parameters and replace old tracking labels", () => {
	const url = new URL(campaignLink({ url: "https://mortal-jan.shika.workers.dev/q/12?from=sharer&utm_source=old", source: "x", campaign: "first-trial", content: "post-01" }));
	assert.equal(url.searchParams.get("from"), "sharer");
	assert.equal(url.searchParams.get("utm_source"), "x");
	assert.equal(url.searchParams.get("utm_medium"), "organic_social");
	assert.equal(url.searchParams.get("utm_content"), "post-01");
	assert.throws(() => campaignLink({ url: "https://other.example/q/12", source: "x", campaign: "trial", content: "post-01" }));
	assert.throws(() => campaignLink({ url: "https://mortal-jan.shika.workers.dev/u/private", source: "x", campaign: "trial", content: "post-01" }));
});
