"""
Numbers as words for the MMS voices, which skip digits ("Item 3" was read as "Item"). Same rules as
apps/web-components/src/tts/numberWords.ts (named numbers_words so it never hides Python's own numbers module); the fixtures test checks both give the same text.
Whole numbers 0 to 999 are said as words; longer ones digit by digit. The wording needs a speaker check.
"""
import re

WORDS = {
    "am": {
        "units": ["ዜሮ", "አንድ", "ሁለት", "ሦስት", "አራት", "አምስት", "ስድስት", "ሰባት", "ስምንት", "ዘጠኝ"],
        "ten": "አሥር", "teen": "አሥራ {u}",
        "tens": ["", "", "ሃያ", "ሠላሳ", "አርባ", "ሃምሳ", "ስልሳ", "ሰባ", "ሰማንያ", "ዘጠና"], "tens_unit": "{t} {u}",
        "hundred": "መቶ", "hundreds": "{u} መቶ", "join": "{h} {r}",
    },
    "om": {
        "units": ["zeeroo", "tokko", "lama", "sadii", "afur", "shan", "jaha", "torba", "saddeet", "sagal"],
        "ten": "kudhan", "teen": "kudha {u}",
        "tens": ["", "", "digdama", "soddoma", "afurtama", "shantama", "jaatama", "torbaatama", "saddeettama", "sagaltama"],
        "tens_unit": "{t_stem}ii {u}",
        "hundred": "dhibba", "hundreds": "dhibba {u}", "join": "{h} fi {r}",
    },
    "ti": {
        "units": ["ዜሮ", "ሓደ", "ክልተ", "ሰለስተ", "ኣርባዕተ", "ሓሙሽተ", "ሽዱሽተ", "ሸውዓተ", "ሸሞንተ", "ትሽዓተ"],
        "ten": "ዓሰርተ", "teen": "ዓሰርተ {u}",
        "tens": ["", "", "ዕስራ", "ሰላሳ", "ኣርብዓ", "ሓምሳ", "ሱሳ", "ሰብዓ", "ሰማንያ", "ቴስዓ"], "tens_unit": "{t}ን {u}ን",
        "hundred": "ሚእቲ", "hundreds": "{u} ሚእቲ", "join": "{h} {r}",
    },
    "so": {
        "units": ["eber", "kow", "laba", "saddex", "afar", "shan", "lix", "toddoba", "siddeed", "sagaal"],
        "ten": "toban", "teen": "{u} iyo toban",
        "tens": ["", "", "labaatan", "soddon", "afartan", "konton", "lixdan", "toddobaatan", "siddeetan", "sagaashan"],
        "tens_unit": "{t} iyo {u}",
        "hundred": "boqol", "hundreds": "{u} boqol", "join": "{h} iyo {r}",
    },
}
DIGITS = re.compile(r"[0-9]+")  # ASCII digits only, like the browser version


def say_number(n: int, lang: str) -> str:
    w = WORDS[lang]
    units = w["units"]
    if n < 10:
        return units[n]
    if n == 10:
        return w["ten"]
    if n < 20:
        return w["teen"].format(u=units[n - 10])
    if n < 100:
        t, u = divmod(n, 10)
        tens = w["tens"][t]
        if not u:
            return tens
        return w["tens_unit"].format(t=tens, t_stem=tens[:-1] if tens.endswith("a") else tens, u=units[u])
    h, rest = divmod(n, 100)
    head = w["hundred"] if h == 1 else w["hundreds"].format(u=units[h])
    return head if not rest else w["join"].format(h=head, r=say_number(rest, lang))


def spell_numbers(text: str, lang: str) -> str:
    if lang not in WORDS:
        return text

    def one(match: re.Match) -> str:
        digits = match.group(0)
        if len(digits) <= 3:
            return f" {say_number(int(digits), lang)} "
        return " " + " ".join(WORDS[lang]["units"][int(d)] for d in digits) + " "

    return DIGITS.sub(one, text)
