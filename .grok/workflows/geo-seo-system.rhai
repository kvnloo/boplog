let meta = #{
    name: "geo-seo-system",
    description: "Build GEO/SEO hub (tags, topics, anti-game benchmarks), probe multi-engine, improve content, commit/push deploy",
    when_to_use: "Overnight or full GEO+SEO system build for boplog visibility",
    phases: [
        #{ title: "Scaffold", detail: "tags, topic hubs, sitemap, llms, package scripts" },
        #{ title: "Benchmark", detail: "anti-game discovery/branded/negative multi-engine probe" },
        #{ title: "Improve", detail: "close gaps on topic pages and extractable copy" },
        #{ title: "Verify", detail: "re-bench + npm check + commit push" },
    ],
};

let ok_schema = #{
    "type": "object",
    "required": ["ok", "summary"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "paths": #{ "type": "array", "items": #{ "type": "string" } },
        "metrics": #{ "type": "object" },
    },
};

let engines_csv = "hermes,claude,omp,codex";
if args != () && args.engines_csv != () {
    engines_csv = args.engines_csv;
}
let skip_push = false;
if args != () && args.skip_push == true {
    skip_push = true;
}

phase("Scaffold");
let scaffold_prompt = "";
scaffold_prompt += "You are building the GEO/SEO system for /workspace/boplog (static GH Pages site).\n";
scaffold_prompt += "Work only under /workspace/boplog. Use execute tools.\n\n";
scaffold_prompt += "Required steps (idempotent — re-run safe):\n";
scaffold_prompt += "1. Ensure data/taxonomy.json and data/project-tags.json exist; fill gaps if any project lacks domains.\n";
scaffold_prompt += "2. Run: node scripts/apply-tags.mjs\n";
scaffold_prompt += "3. Run: node scripts/build-topics.mjs  (creates topics/*.html)\n";
scaffold_prompt += "4. Confirm index.html has primary top links (x, github, linkedin, https://ek.vin/ card) and #links panel with presence/surfaces/machine-readable. NO phone numbers.\n";
scaffold_prompt += "5. Confirm llms.txt lists primary links + all topic URLs under https://kvnloo.github.io/boplog/topics/\n";
scaffold_prompt += "6. Ensure scripts/geo-benchmark.mjs and scripts/geo-overnight.mjs exist and npm scripts geo:build, geo:bench, geo:overnight are in package.json\n";
scaffold_prompt += "7. Add minimal CSS for .topic-page* and .links-panel* if missing\n";
scaffold_prompt += "8. Bump cache-bust version in index.html + app.js BUILD_VERSION\n";
scaffold_prompt += "9. npm run check — fix failures\n";
scaffold_prompt += "Return {ok, summary, paths[]}.\n";

let sc = agent(scaffold_prompt, #{
    label: "geo-scaffold",
    capability_mode: "execute",
    output_schema: ok_schema,
});
if sc == () || sc.success != true {
    pause("infra", "Scaffold agent failed — resume to retry");
}
log("Scaffold: " + sc.output.summary);

phase("Benchmark");
let bench_prompt = "";
bench_prompt += "Run the anti-game GEO benchmark for /workspace/boplog.\n";
bench_prompt += "Engines CSV: " + engines_csv + "\n\n";
bench_prompt += "1. Read data/llmeo/benchmark.json — discovery prompts MUST NOT contain brand tokens.\n";
bench_prompt += "2. Run: node scripts/geo-benchmark.mjs --engines " + engines_csv + "\n";
bench_prompt += "   Allow long runtime (up to 45+ min). Capture stdout path of raw.json and scoreboard.\n";
bench_prompt += "3. Read the benchmark-scoreboard.md and report suite rates (discovery, branded, negative) and healthy flag.\n";
bench_prompt += "4. claude engine must use CLAUDE_CONFIG_DIR=$HOME/.claude-home (already in geo-benchmark.mjs).\n";
bench_prompt += "5. Soft-skip engines that auth-fail; do not fail the whole run.\n";
bench_prompt += "Return {ok, summary, paths[], metrics: {discovery_rate, branded_rate, negative_rate, healthy}}.\n";

let bm = agent(bench_prompt, #{
    label: "geo-benchmark",
    capability_mode: "execute",
    output_schema: ok_schema,
});
if bm == () || bm.success != true {
    pause("infra", "Benchmark agent failed — resume after fixing harnesses");
}
log("Benchmark: " + bm.output.summary);

phase("Improve");
let improve_prompt = "";
improve_prompt += "Improve /workspace/boplog extractability based on the latest anti-game benchmark gaps.\n";
improve_prompt += "Latest summary: " + json_encode(bm.output) + "\n\n";
improve_prompt += "Rules:\n";
improve_prompt += "- Do NOT put brand names into discovery probe prompts (data/llmeo/benchmark.json discovery suite).\n";
improve_prompt += "- DO strengthen topic pages (topics/*.html via build-topics or static copy), FAQ, llms.txt, and project descriptions so web answers can cite real URLs.\n";
improve_prompt += "- Prefer first-sentence answers on topic hubs for intents in data/taxonomy.json.\n";
improve_prompt += "- Re-run node scripts/apply-tags.mjs && node scripts/build-topics.mjs after tag/description edits.\n";
improve_prompt += "- If discovery rate is low, expand topic page lead paragraphs with distinctive phrases matching expect_mention without keyword spam.\n";
improve_prompt += "- npm run check after edits.\n";
improve_prompt += "Return {ok, summary, paths[]}.\n";

let imp = agent(improve_prompt, #{
    label: "geo-improve",
    capability_mode: "execute",
    output_schema: ok_schema,
});
if imp == () || imp.success != true {
    pause("infra", "Improve agent failed — resume to retry");
}
log("Improve: " + imp.output.summary);

phase("Verify");
let verify_prompt = "";
verify_prompt += "Verify and deploy /workspace/boplog GEO system.\n";
verify_prompt += "Engines: " + engines_csv + "\n";
verify_prompt += "skip_push=" + (if skip_push { "true" } else { "false" }) + "\n\n";
verify_prompt += "1. Run: node scripts/geo-benchmark.mjs --engines " + engines_csv + " --suite discovery,branded,negative\n";
verify_prompt += "   (or full default). Capture healthy + suite rates.\n";
verify_prompt += "2. npm run check\n";
verify_prompt += "3. git status; commit ALL intentional geo/seo changes with a clear message (tags, topics, scripts, links, llms).\n";
verify_prompt += "4. If skip_push is false: git pull --rebase origin main && git push origin HEAD\n";
verify_prompt += "5. Start overnight loop in background if not already: nohup node scripts/geo-overnight.mjs --hours 8 --engines " + engines_csv + " --commit >> data/llmeo/overnight/nohup.log 2>&1 &\n";
verify_prompt += "   Create data/llmeo/overnight if needed. Record PID in summary.\n";
verify_prompt += "Return {ok, summary, paths[], metrics}.\n";

let vf = agent(verify_prompt, #{
    label: "geo-verify-deploy",
    capability_mode: "execute",
    output_schema: ok_schema,
});
if vf == () || vf.success != true {
    pause("verification", "Verify/deploy failed — resume after fix");
}
log("Verify: " + vf.output.summary);

let report = "";
report += "# geo-seo-system result\n\n";
report += "## Scaffold\n" + sc.output.summary + "\n\n";
report += "## Benchmark\n" + bm.output.summary + "\n\n";
report += "## Improve\n" + imp.output.summary + "\n\n";
report += "## Verify\n" + vf.output.summary + "\n\n";
let report_path = write_scratch_file("geo-seo-system-report.md", report);

complete(#{
    path: report_path,
    report: report,
    scaffold: sc.output,
    benchmark: bm.output,
    improve: imp.output,
    verify: vf.output,
});
