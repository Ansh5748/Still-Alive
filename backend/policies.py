"""Platform policy directives — injected into Agent 2's prompt per selected platform.

These are summarized for prompt injection. For deeper retrieval, the full policy
URLs are kept here for reference (a future iteration can ingest them into ChromaDB).
"""

PLATFORM_POLICIES = {
    "youtube": {
        "name": "YouTube",
        "directive": (
            "YOUTUBE COMMUNITY GUIDELINES + MONETIZATION (key triggers):\n"
            "- Hate speech / harassment / cyberbullying → demonetisation + strike risk\n"
            "- Misinformation (medical, elections, harmful conspiracies) → removal\n"
            "- Dangerous/harmful content, weapon instructions → removal\n"
            "- Copyright (DMCA) — even short third-party clips can trigger Content ID\n"
            "- Spam, deceptive practices, scams → removal + strike\n"
            "- Sexual content / nudity → age-restrict or remove\n"
            "- Child safety → channel termination\n"
            "- Profanity in first 8s or thumbnail/title → ad-friendly demonetisation"
        ),
        "urls": [
            "https://support.google.com/youtube/answer/9288567",
            "https://www.youtube.com/creators/how-things-work/policies-guidelines/",
            "https://support.google.com/youtube/answer/2802032",
        ],
    },
    "instagram": {
        "name": "Instagram",
        "directive": (
            "INSTAGRAM / META COMMUNITY STANDARDS (key triggers):\n"
            "- Hate speech, bullying, harassment → removal/restrict\n"
            "- Nudity & sexual activity → strict removal\n"
            "- Violence and graphic content → removal\n"
            "- IP/copyright/trademark → DMCA takedown\n"
            "- Dangerous individuals/organisations → permanent ban\n"
            "- Spam, fake engagement, misleading content → reach reduction\n"
            "- Sale of regulated goods (alcohol/tobacco/firearms) → removal"
        ),
        "urls": [
            "https://help.instagram.com/477434105621119",
            "https://transparency.meta.com/policies/community-standards/",
        ],
    },
    "x": {
        "name": "X (Twitter)",
        "directive": (
            "X RULES + INDIA-SPECIFIC (key triggers):\n"
            "- Violent speech / threats / glorification of violence → suspend\n"
            "- Hateful conduct (caste, religion, gender) → ban — extra strict in India\n"
            "- Manipulated media / synthetic media without label → label or remove\n"
            "- Civic integrity / election misinformation → label or remove\n"
            "- Private information / doxxing → immediate removal\n"
            "- Copyright (DMCA) and trademark → tweet removed, repeat = ban\n"
            "- Spam / platform manipulation → account lock"
        ),
        "urls": [
            "https://help.x.com/en/rules-and-policies/x-rules",
            "https://help.x.com/en/rules-and-policies/x-india",
        ],
    },
    "linkedin": {
        "name": "LinkedIn",
        "directive": (
            "LINKEDIN PROFESSIONAL COMMUNITY POLICIES (key triggers):\n"
            "- Off-topic, sales-y or self-promotional spam → reach throttle\n"
            "- Harassment / hate speech / discrimination → removal + restrict\n"
            "- Misleading content, fake news, scams → removal\n"
            "- Adult/sexual content not allowed (even mild) → removal\n"
            "- Plagiarised content / copyright → removal\n"
            "- Politicial inflammatory content discouraged → reduced reach\n"
            "- Personal attacks on named professionals → notice + removal"
        ),
        "urls": [
            "https://www.linkedin.com/help/linkedin/answer/a1336721/professional-community-policies",
            "https://www.linkedin.com/legal/user-agreement",
        ],
    },
    "facebook": {
        "name": "Facebook",
        "directive": (
            "FACEBOOK / META COMMUNITY STANDARDS (key triggers):\n"
            "- Hate speech / harassment → demotion or removal\n"
            "- Misinformation (health, civic, climate) → fact-check label + reach cut\n"
            "- Nudity / sexual content → removal\n"
            "- Graphic violence → warning screen or removal\n"
            "- Copyright / IP → DMCA takedown\n"
            "- Engagement bait, click-bait → reach throttle\n"
            "- Regulated goods → removal"
        ),
        "urls": [
            "https://transparency.meta.com/policies/community-standards/",
            "https://www.facebook.com/legal/terms",
        ],
    },
    "threads": {
        "name": "Threads",
        "directive": (
            "THREADS (inherits Instagram + Meta policies):\n"
            "- Same Meta community standards as Instagram\n"
            "- Hate speech, harassment, bullying → removal\n"
            "- Misinformation → label / reach reduction\n"
            "- Political content de-prioritised by default\n"
            "- Nudity / sexual content → strict removal\n"
            "- IP/copyright → DMCA takedown"
        ),
        "urls": [
            "https://about.instagram.com/safety/threads",
            "https://transparency.meta.com/policies/community-standards/",
        ],
    },
}

INDIAN_LEGAL_DIRECTIVE = (
    "INDIAN LEGAL FRAMEWORK (cite REAL acts/sections only):\n"
    "- Indian Penal Code 1860 (Bhartiya Nyaya Sanhita 2023): defamation S499/S500 IPC ↔ S354 BNS; "
    "promoting enmity S153A ↔ S196 BNS; outraging religious feelings S295A ↔ S299 BNS; "
    "criminal intimidation S503/S506 ↔ S351 BNS.\n"
    "- IT Act 2000 (S66 fraud, S67 obscenity, S67A sexually explicit, S69 interception) — "
    "S66A was STRUCK DOWN by SC (Shreya Singhal v UoI 2015), NEVER cite S66A.\n"
    "- IT Rules 2021 (Intermediary Guidelines + Digital Media Ethics Code) — applies to creators\n"
    "- Copyright Act 1957 (S51 infringement, S52 fair dealing)\n"
    "- Consumer Protection Act 2019 + CCPA misleading-ad guidelines, ASCI Code\n"
    "- SEBI (Investment Advisers) Regulations 2013 — finfluencer disclosures\n"
    "- FSSAI rules for food/health claims\n"
    "Primary citation source: indiankanoon.org via API."
)


def policy_for(platform: str) -> str:
    p = (platform or "").lower()
    pol = PLATFORM_POLICIES.get(p) or PLATFORM_POLICIES["youtube"]
    return pol["directive"]
