let meta = #{
    name: "llmeo-geo-loop",
    description: "GEO/LLMEO: ship site extractability gaps, build prompt bank + probe CLI, run live harness tests, write scoreboard",
    when_to_use: "When improving boplog for AI search citations and running multi-harness GEO probes",
    phases: [
        #{ title: "Implement", detail: "FAQ HTML, schema, llms.txt, robots, prompts, probe script" },
        #{ title: "Probe", detail: "Live CLI harness runs against the prompt bank" },
        #{ title: "Score", detail: "Scoreboard, share-of-voice, next actions" },
    ],
};

let implement_schema = #{
    "type": "object",
    "required": ["ok", "files_touched", "summary"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "files_touched": #{ "type": "array", "items": #{ "type": "string" } },
        "summary": #{ "type": "string" },
        "npm_check": #{ "type": "string" },
    },
};

let probe_schema = #{
    "type": "object",
    "required": ["ok", "run_dir", "engines_tried", "raw_results_path", "notes"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "run_dir": #{ "type": "string" },
        "engines_tried": #{ "type": "array", "items": #{ "type": "string" } },
        "raw_results_path": #{ "type": "string" },
        "notes": #{ "type": "string" },
    },
};

let score_schema = #{
    "type": "object",
    "required": ["ok", "scoreboard_path", "share_of_voice", "summary", "next_actions"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "scoreboard_path": #{ "type": "string" },
        "share_of_voice": #{ "type": "number" },
        "summary": #{ "type": "string" },
        "next_actions": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 8 },
    },
};

// Optional args: engines_csv (e.g. "hermes,gemini"), limit (max prompts), skip_implement (bool)
// Use CSV string so dry-run/canned args stay simple (no array typing issues).
let engines_csv = "hermes,gemini,claude";
if args != () && args.engines_csv != () {
    engines_csv = args.engines_csv;
}
let limit = 8;
if args != () && args.limit != () {
    limit = args.limit;
}
let skip_implement = false;
if args != () && args.skip_implement == true {
    skip_implement = true;
}

let engines_json = engines_csv;
let limit_str = limit.to_string();

phase("Implement");
let impl = #{
    ok: true,
    files_touched: [],
    summary: "skipped",
    npm_check: "skipped",
};
if skip_implement != true {
    let impl_prompt = "";
    impl_prompt += "You are implementing GEO/LLMEO (generative engine optimization) for the boplog static site at /workspace/boplog.\n";
    impl_prompt += "Use read_file, search_replace/write, list_dir, grep, and run_terminal_command. Work only under /workspace/boplog.\n\n";
    impl_prompt += "## Required deliverables\n\n";
    impl_prompt += "1) **Static extractable FAQ** in index.html (server-readable, not JS-only):\n";
    impl_prompt += "   - Section id=\"faq\" after about or before machine-readable\n";
    impl_prompt += "   - Q/A pairs with clear H2/H3, first sentence is the direct answer:\n";
    impl_prompt += "     What is boplog? Who is Kevin Rajan? What is zer0? What is zerOS?\n";
    impl_prompt += "     What product tracks appear on the site? How are projects included?\n";
    impl_prompt += "   - Keep all-lowercase visual style of the site (CSS already lowercases)\n";
    impl_prompt += "   - Add minimal CSS if needed for .faq\n\n";
    impl_prompt += "2) **JSON-LD schema** in index.html:\n";
    impl_prompt += "   - Expand Person.sameAs: github, https://x.com/_kvnloo, portfolio URLs\n";
    impl_prompt += "   - Add Organization for zer0 linked to the person\n";
    impl_prompt += "   - Add FAQPage schema matching the FAQ section\n";
    impl_prompt += "   - Keep existing Dataset / CollectionPage / WebSite\n\n";
    impl_prompt += "3) **llms.txt**: add product tracks (zeros/zerOS stealth, health, world sim, evolve, blueprint),\n";
    impl_prompt += "   entity one-liners, prefer JSON fields instruction, link to FAQ anchors if any.\n\n";
    impl_prompt += "4) **robots.txt**: explicit Allow for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Amazonbot\n";
    impl_prompt += "   (site is public; do not block AI crawlers).\n\n";
    impl_prompt += "5) **Prompt bank** at data/llmeo/prompts.json:\n";
    impl_prompt += "   Schema: { version, site, entity_terms: string[], prompts: [\n";
    impl_prompt += "     { id, prompt, category, fanouts: string[], expect_mention: string[], expect_urls: string[] }\n";
    impl_prompt += "   ] }\n";
    impl_prompt += "   Include 12–18 prompts: branded entity, products (boplog, evolve, tmux-agent-fleet, zerOS),\n";
    impl_prompt += "   portfolio/build-log, accuracy traps. site=https://kvnloo.github.io/boplog/\n\n";
    impl_prompt += "6) **Probe CLI** scripts/llmeo-probe.mjs:\n";
    impl_prompt += "   - Node >=20, no deps beyond node stdlib\n";
    impl_prompt += "   - Usage: node scripts/llmeo-probe.mjs [--engines hermes,gemini,claude] [--limit N] [--dry-run]\n";
    impl_prompt += "   - Reads data/llmeo/prompts.json\n";
    impl_prompt += "   - For each engine×prompt (up to limit), run harness non-interactively:\n";
    impl_prompt += "     * hermes: `hermes -z \"<prompt>\" --cli --yolo` with timeout ~90s\n";
    impl_prompt += "     * gemini: `gemini -p \"<prompt>\" --yolo` timeout ~90s\n";
    impl_prompt += "     * claude: `claude -p \"<prompt>\" --bare` if available, else skip with note\n";
    impl_prompt += "   - System instruction prefix: answer using public web knowledge; if citing Kevin Rajan/kvnloo/boplog, prefer https://kvnloo.github.io/boplog/\n";
    impl_prompt += "   - Write results to data/llmeo/runs/<ISO-date>/raw.json\n";
    impl_prompt += "   - Each result: { engine, prompt_id, prompt, stdout, stderr, exit_code, ms }\n";
    impl_prompt += "   - --dry-run only lists planned jobs\n\n";
    impl_prompt += "7) **Score CLI** scripts/llmeo-score.mjs:\n";
    impl_prompt += "   - Input: path to raw.json (or latest run dir)\n";
    impl_prompt += "   - Score each answer 0/1 for: mentioned entity terms, mentioned expect_urls, no hallucinated private claims if detectable\n";
    impl_prompt += "   - Write data/llmeo/runs/<date>/scoreboard.md and scores.json\n";
    impl_prompt += "   - share_of_voice = fraction of prompts with any correct entity mention across any engine\n\n";
    impl_prompt += "8) package.json scripts: \"llmeo:probe\", \"llmeo:score\", \"llmeo:dry\"\n";
    impl_prompt += "9) Bump cache-bust version in index.html + app.js BUILD_VERSION if you edit them\n";
    impl_prompt += "10) Run npm run check and fix failures\n\n";
    impl_prompt += "Return JSON: ok, files_touched[], summary, npm_check output snippet.\n";

    impl = agent(impl_prompt, #{
        label: "geo-implement",
        capability_mode: "execute",
        output_schema: implement_schema,
    });
    if impl == () || impl.success != true {
        pause("infra", "Implement agent failed — resume to retry or fix manually under /workspace/boplog");
    }
    impl = impl.output;
    log("Implement: " + impl.summary);
}

phase("Probe");
let probe_prompt = "";
probe_prompt += "You run live GEO probes for boplog using installed CLI harnesses.\n";
probe_prompt += "Working directory: /workspace/boplog\n";
probe_prompt += "Engines (JSON): " + engines_json + "\n";
probe_prompt += "Limit prompts: " + limit_str + "\n\n";
probe_prompt += "Steps:\n";
probe_prompt += "1. Confirm data/llmeo/prompts.json and scripts/llmeo-probe.mjs exist (create minimal stubs only if missing).\n";
probe_prompt += "2. Run dry-run: node scripts/llmeo-probe.mjs --dry-run --limit " + limit_str + "\n";
probe_prompt += "3. Run live: node scripts/llmeo-probe.mjs --engines " + engines_csv + " --limit " + limit_str + "\n";
probe_prompt += "   Allow long timeouts (up to 15 minutes total). Capture stdout/stderr.\n";
probe_prompt += "4. If an engine is not installed or auth-fails, skip it and note why — do not fail the whole run.\n";
probe_prompt += "5. Locate the written raw.json under data/llmeo/runs/ and report its path.\n";
probe_prompt += "Return JSON: ok, run_dir, engines_tried[], raw_results_path, notes.\n";

let probe = agent(probe_prompt, #{
    label: "geo-probe",
    capability_mode: "execute",
    output_schema: probe_schema,
});
if probe == () || probe.success != true {
    pause("infra", "Probe agent failed — check harness logins (claude/gemini/hermes) then resume");
}
probe = probe.output;
log("Probe: " + probe.notes);

phase("Score");
let score_prompt = "";
score_prompt += "Score GEO probe results for /workspace/boplog.\n";
score_prompt += "raw_results_path from previous phase: " + json_encode(probe.raw_results_path) + "\n";
score_prompt += "run_dir: " + json_encode(probe.run_dir) + "\n\n";
score_prompt += "1. Run: node scripts/llmeo-score.mjs <raw.json or run dir>\n";
score_prompt += "   If score script missing, implement a minimal one that reads raw.json + prompts.json.\n";
score_prompt += "2. Ensure scoreboard.md and scores.json exist under the run dir.\n";
score_prompt += "3. Also write data/llmeo/LATEST.md pointing at this run with share_of_voice and top gaps.\n";
score_prompt += "4. Optionally improve llms.txt / FAQ if scores show obvious extractability fails — keep changes small.\n";
score_prompt += "5. Run npm run check if you edited site files.\n";
score_prompt += "Return JSON: ok, scoreboard_path, share_of_voice (0-1), summary, next_actions[].\n";

let score = agent(score_prompt, #{
    label: "geo-score",
    capability_mode: "execute",
    output_schema: score_schema,
});
if score == () || score.success != true {
    pause("verification", "Score agent failed — resume after fixing score script / raw results");
}
score = score.output;
log("SoV=" + score.share_of_voice.to_string() + " " + score.summary);

let report = "";
report += "# LLMEO / GEO loop result\n\n";
report += score.summary + "\n\n";
report += "- share_of_voice: " + score.share_of_voice.to_string() + "\n";
report += "- scoreboard: " + score.scoreboard_path + "\n";
report += "- probe: " + probe.raw_results_path + "\n";
report += "- implement: " + impl.summary + "\n\n";
report += "## Next actions\n";
let actions = [];
if score.next_actions != () && type_of(score.next_actions) == "array" {
    actions = score.next_actions;
}
for a in actions {
    report += "- " + a + "\n";
}
let report_path = write_scratch_file("llmeo-geo-report.md", report);

complete(#{
    path: report_path,
    report: report,
    share_of_voice: score.share_of_voice,
    scoreboard_path: score.scoreboard_path,
    raw_results_path: probe.raw_results_path,
    implement_summary: impl.summary,
    next_actions: actions,
});
