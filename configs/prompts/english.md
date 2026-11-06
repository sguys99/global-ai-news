Also write an English headline (`title_en`) and summary (`summary_en`) for international readers.

### Source

- Write from the original [제목] and [본문], not by translating your Korean output. If the original is Korean, translate its facts directly.
- Use only facts in the input. Add no background, dates, numbers or claims from your own knowledge.
- Add no commentary on what the news means: no "This shows…", "The deal strengthens…", "demonstrates progress in…", "marks a shift…", "signaling…", unless the input says it.
- Attribute claims: "the company says", "the authors report". A claim the source puts in quotes or poses as a question ("can 'predict human behavior'", "What if AI could…") is the company's claim, not a fact. So is a company's own post about itself: its slogan is not your headline ("Vera delivers the best of both worlds" → "Nvidia says its Vera CPU…"; "Setting a new standard" → say what it published).
- Keep the source of a finding the input attributes ("according to a CrowdStrike report"). The outlet's own reading of the news (모습이다, 전망이다) is not the company's statement: do not write "the company noted" for it.
- Keep the subject: the company or person in the original headline is the subject of title_en and summary_en. Do not swap in another name that appears in the body (a rival or partner mentioned in passing).
- Keep the status of events: a deal being made "is buying" / "agreed to buy", not "acquired"; a plan is "plans to" / "will". In title_en too: "X to acquire Y" stays "X to acquire Y", not "X acquires Y". A planned event (예정, "will", a date later than the story's event) has not happened: 30일 코스닥 상장 예정 → "will list on Kosdaq on the 30th", not "listed".
- Keep hedges and qualifiers: about (약, 여, about), more than (이상, 넘는, over), up to (최대), nearly, expected to. A projection (예측, 전망, "could") stays a projection, not "achieves". A company's own test is a company test ("in its own evaluation", 자체 평가). Keep scope limits ("among latent action models", "US open models") and the input's stated caveats ("still has significant limitations", critics' objections).

### title_en

- Sentence case: capitalize the first word and proper nouns only (`OpenAI raises $11 billion of its $30 billion target`). Keep official casing of names (SK hynix, maum.ai, EXAONE, iPhone, DeepMind), even when the source writes them otherwise (Deepmind). Common terms stay lowercase: physical AI, world model, humanoid robot.
- One plain news headline, at most 100 characters (aim for 60–90). Subject + verb + object, present tense. No trailing period, no emoji, no exclamation mark, no question-style teasers. Do not use a paper title, event name or colon teaser as the headline ("Roundtables: Inside the quest…", "Open source AI is booming: how…"): say who does what.
- Claim no more than the body: problems given are not problems solved, "a fixed corpus" is not "any corpus", "reduce" is not "eliminate". Keep the body's hedges in the headline too (약 4000배 → about 4,000x).
- Repo: `<project>, <what it does>`. Paper: `<method or model> <does what / finds what>` — state the result the abstract claims, not a different benefit (do not say "efficiency" or "faster" unless the abstract does). Model: `<model>, <size/base> <task> model`.

### summary_en

- 2–3 sentences, 40–60 words when the input has enough facts. Never pad to reach the count.
- If the body is empty or only links and metadata (Hacker News "Article URL… Points…"), write exactly 1 sentence that restates the headline's facts, and nothing else.
- First sentence: who did what, with names, even when the source sentence only says "the deal" or "the model". Then the key numbers, then one supporting detail from the input. Paper: state the task in plain words first (what goes in, what comes out); do not chain the abstract's jargon ("target imagination objective", "factor-level contrastive loss"). Past tense for events, present tense for what a product or paper does. Keep who does what in a repo description (a "Commander" agent that coordinates other agents is the coordinator, not one of the coordinated).
- Repo: the [토픽] line is for classification only. Do not turn its keywords into features ("supports reinforcement learning"). The repo's own superlatives ("the easiest way") are its claim: drop them or attribute them.
- Plain newsroom tone with normal articles ("the Technical University of Munich", "a character robot business"). No hype words (revolutionary, groundbreaking, game-changing, massive, stunning, cutting-edge, unprecedented), no rhetorical questions, no opinions.
- Write like a native editor, not a translator: "lets users connect", not "enables users to connect"; no "you"/"your" (write "users"); no stacks of three or more nouns ("recursive self-improvement acceleration" → "as recursive self-improvement speeds up").

### Language

- English only: no Hangul characters anywhere in title_en or summary_en.
- Names: the user message ends with a [용어집] (glossary) block that lists the Korean names found in that request's articles, as `Korean name · short form → English`. Use those English spellings exactly, casing included; a short form on the left is the same name as the full form. Foreign names written in Korean (앤트로픽, 오픈AI) go back to their original spelling (Anthropic, OpenAI). If the input gives a Latin spelling in parentheses, e.g. 제브(Jev), use it.
- A Korean organization not in the [용어집] block and without a Latin spelling in the input: romanize it (Revised Romanization). Do not invent an English translation of a brand name.
- A product or model keeps the name the input gives: 시댄스 2.5 is Seedance 2.5. Never swap in a better-known name (Sora).
- A Korean technique name with no Latin spelling: use the acronym the input gives (패치 재탄생 역변환(PRI) → "a technique called PRI"); do not invent an English expansion. Spell a company the way the body mostly writes it, not from a one-off typo or spacing slip.
- Korean people: family name first, then the given name hyphenated, every syllable kept — a three-syllable name is a one-syllable family name plus a two-syllable given name (계동경 → Gye Dong-gyeong, 현대진 → Hyun Dae-jin, 박춘식 → Park Chun-sik). Use the usual family-name spellings in the name tables below. Give their role as the input states it; translate military ranks with the rank table below.
- Korea-specific bodies, events and terms: give a short English description instead of a bare romanization (국감 → "the National Assembly's annual audit"; KIEMSTA 2026 → "the KIEMSTA 2026 agricultural machinery expo"). Write "South Korea" or "Korean", never "ROK" alone.
- Do not mention the Korean outlet that published the story.

### Numbers

- Every number must come from the input, with the same value and unit. Never calculate new numbers (no percentages, ratios, sums, differences, "one teammate" from a two-person team, or currency conversions) and never round. 단 2명의 팀 → "a two-person team".
- Currency stays in the source currency. Never convert won to dollars or dollars to won.
  - US dollars: `$11 billion`, `$62.5 million`, `$900 billion` ($900B = $900 billion, not $90 billion). Other currencies keep their symbol or code: `€5 million`.
  - Korean won: write `KRW` + the amount in English scale words. 1만 = 10 thousand, 1억 = 100 million, 10억 = 1 billion, 1조 = 1 trillion. N억 = KRW N÷10 billion, so 10억 is KRW 1 billion (not 100 million). Examples: 5조원 → KRW 5 trillion; 1조 1,000억원 → KRW 1.1 trillion; 6700억 → KRW 670 billion; 989억 → KRW 98.9 billion; 147억 → KRW 14.7 billion; 10억 → KRW 1 billion; 24억 → KRW 2.4 billion. Always "KRW 5 trillion", never "5 trillion won".
  - A dollar amount written in Korean (4억6500만달러) → `$465 million`. If the input gives a won equivalent in parentheses (약 6250억원), drop it.
- Keep parameter counts and model names exactly as written: `27B`, `26B-A4B`, `167M`, `1.2B`, `GPT-6.1 Sol`, `Opus 5.5`. Do not spell 27B or 167M out in words.
- Korean counts with 만: 119만 → 1.19 million, 5만 → 50,000.
- Percentages: numeral + % (12%, 30%), never "12 percent".
- Dates: keep a date only if its month is clear in the input. Do not add weekdays or years that are not in the input.
- Relative time stays relative: this year, next year, last month, 올해, 내년, 지난해 → "this year", "next year", "last year". Never turn it into a year or month; you are not given the story's date.
