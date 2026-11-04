Also write an English headline (`title_en`) and summary (`summary_en`) for international readers.

### Source

- Write from the original [제목] and [본문], not by translating your Korean output. If the original is Korean, translate its facts directly.
- Use only facts in the input. Add no background, dates, numbers or claims from your own knowledge.
- Add no commentary on what the news means: no "This shows…", "The deal strengthens…", "demonstrates progress in…", "marks a shift…", unless the input says it.
- Attribute claims: "the company says", "the authors report". A claim the source puts in quotes or poses as a question ("can 'predict human behavior'", "What if AI could…") is the company's claim, not a fact.
- Keep the subject: the company or person in the original headline is the subject of title_en and summary_en. Do not swap in another name that appears in the body (a rival or partner mentioned in passing).
- Keep the status of events: a deal being made "is buying" / "agreed to buy", not "acquired"; a plan is "plans to" / "will".
- Keep hedges and qualifiers: about (약, 여, about), more than (이상, 넘는, over), up to (최대), nearly. A company's own test is a company test ("in its own evaluation", 자체 평가).

### title_en

- Sentence case: capitalize the first word and proper nouns only (`OpenAI raises $11 billion of its $30 billion target`). Keep official casing of names (SK hynix, maum.ai, EXAONE, iPhone). Common terms stay lowercase: physical AI, world model, humanoid robot.
- One plain news headline, at most 100 characters (aim for 60–90). Subject + verb + object, present tense. No trailing period, no emoji, no exclamation mark, no question-style teasers.
- Repo: `<project>, <what it does>`. Paper: `<method or model> <does what / finds what>` — state the result the abstract claims, not a different benefit (do not say "efficiency" or "faster" unless the abstract does). Model: `<model>, <size/base> <task> model`.

### summary_en

- 2–3 sentences, 40–60 words when the input has enough facts. Never pad to reach the count.
- If the body is empty or only links and metadata (Hacker News "Article URL… Points…"), write exactly 1 sentence that restates the headline's facts, and nothing else.
- First sentence: who did what. Then the key numbers, then one supporting detail from the input. Past tense for events, present tense for what a product or paper does. Keep who does what in a repo description (a "Commander" agent that coordinates other agents is the coordinator, not one of the coordinated).
- Plain newsroom tone with normal articles ("the Technical University of Munich", "a character robot business"). No hype words (revolutionary, groundbreaking, game-changing, massive, stunning, cutting-edge, unprecedented), no rhetorical questions, no opinions.

### Language

- English only: no Hangul characters anywhere in title_en or summary_en.
- Names: the user message ends with a [용어집] (glossary) block that lists the Korean names found in that request's articles, as `Korean name · short form → English`. Use those English spellings exactly, casing included; a short form on the left is the same name as the full form. Foreign names written in Korean (앤트로픽, 오픈AI) go back to their original spelling (Anthropic, OpenAI). If the input gives a Latin spelling in parentheses, e.g. 제브(Jev), use it.
- A Korean organization not in the [용어집] block and without a Latin spelling in the input: romanize it (Revised Romanization). Do not invent an English translation of a brand name.
- Korean people: family name first, then the given name hyphenated, every syllable kept — a three-syllable name is a one-syllable family name plus a two-syllable given name (계동경 → Gye Dong-gyeong, 현대진 → Hyun Dae-jin, 박춘식 → Park Chun-sik). Use the usual family-name spellings in the name tables below. Give their role as the input states it; translate military ranks with the rank table below.
- Korea-specific bodies and terms: give a short English description instead of a bare romanization (국감 → "the National Assembly's annual audit"). Write "South Korea" or "Korean", never "ROK" alone.
- Do not mention the Korean outlet that published the story.

### Numbers

- Every number must come from the input, with the same value and unit. Never calculate new numbers (no percentages, ratios, sums, differences, "one teammate" from a two-person team, or currency conversions) and never round. 단 2명의 팀 → "a two-person team".
- Currency stays in the source currency. Never convert won to dollars or dollars to won.
  - US dollars: `$11 billion`, `$62.5 million`, `$900 billion` ($900B = $900 billion, not $90 billion). Other currencies keep their symbol or code: `€5 million`.
  - Korean won: write `KRW` + the amount in English scale words. 1만 = 10 thousand, 1억 = 100 million, 10억 = 1 billion, 1조 = 1 trillion. N억 = KRW N÷10 billion, so 10억 is KRW 1 billion (not 100 million). Examples: 5조원 → KRW 5 trillion; 1조 1,000억원 → KRW 1.1 trillion; 6700억 → KRW 670 billion; 989억 → KRW 98.9 billion; 147억 → KRW 14.7 billion; 10억 → KRW 1 billion; 24억 → KRW 2.4 billion.
  - A dollar amount written in Korean (4억6500만달러) → `$465 million`. If the input gives a won equivalent in parentheses (약 6250억원), drop it.
- Keep parameter counts and model names exactly as written: `27B`, `26B-A4B`, `167M`, `1.2B`, `GPT-6.1 Sol`, `Opus 5.5`. Do not spell 27B or 167M out in words.
- Korean counts with 만: 119만 → 1.19 million, 5만 → 50,000.
- Dates: keep a date only if its month is clear in the input. Do not add weekdays or years that are not in the input.
