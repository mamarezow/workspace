// Every word the pages show, in Persian and English.
const words = {
  fa: {
    appName: "ورک‌اسپیس",
    signIn: "ورود", signUp: "ساخت حساب", signOut: "خروج",
    username: "نام کاربری", password: "رمز", display: "نام نمایشی", email: "ایمیل (اختیاری)", about: "درباره من",
    haveAccount: "حساب دارم", noAccount: "حساب ندارم",
    profile: "پروفایل", save: "ذخیره", saved: "ذخیره شد",
    lang: "زبان", cal: "تقویم", shamsi: "شمسی", gregorian: "میلادی", weekStart: "شروع هفته",
    sat: "شنبه", sun: "یکشنبه", mon: "دوشنبه",
    myWorkspaces: "ورک‌اسپیس‌های من", noWorkspaces: "هنوز ورک‌اسپیسی نداری. ساختن ورک‌اسپیس به‌زودی این‌جا می‌آید.",
    errors: {
      username_invalid: "نام کاربری باید ۳ تا ۲۰ حرف انگلیسی، عدد یا _ باشد.",
      username_taken: "این نام کاربری گرفته شده.",
      password_short: "رمز باید دست‌کم ۶ حرف باشد.",
      email_invalid: "ایمیل درست نیست.",
      wrong_login: "نام کاربری یا رمز درست نیست.",
      too_many_attempts: "تلاش‌ها زیاد بود. چند دقیقه دیگر دوباره امتحان کن.",
      offline: "اتصال برقرار نشد.",
      default: "مشکلی پیش آمد. دوباره امتحان کن.",
    },
  },
  en: {
    appName: "Workspace",
    signIn: "Sign in", signUp: "Create account", signOut: "Sign out",
    username: "Username", password: "Password", display: "Display name", email: "Email (optional)", about: "About me",
    haveAccount: "I have an account", noAccount: "I don't have an account",
    profile: "Profile", save: "Save", saved: "Saved",
    lang: "Language", cal: "Calendar", shamsi: "Solar Hijri", gregorian: "Gregorian", weekStart: "Week starts on",
    sat: "Saturday", sun: "Sunday", mon: "Monday",
    myWorkspaces: "My workspaces", noWorkspaces: "No workspaces yet. Creating one is coming here soon.",
    errors: {
      username_invalid: "Usernames are 3–20 letters, digits or _.",
      username_taken: "That username is taken.",
      password_short: "Passwords need at least 6 characters.",
      email_invalid: "That email doesn't look right.",
      wrong_login: "Wrong username or password.",
      too_many_attempts: "Too many tries. Try again in a few minutes.",
      offline: "Couldn't connect.",
      default: "Something went wrong. Try again.",
    },
  },
};

let lang = /** @type {"fa" | "en"} */ ("fa");

/** @param {"fa" | "en"} next */
export function setLang(next) {
  lang = next === "en" ? "en" : "fa";
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
}

/** @param {keyof typeof words.fa} key @returns {string} */
export const t = (key) => /** @type {string} */ (words[lang][key]);

/** The message for an error code from the server. @param {string} code */
export const errorText = (code) => words[lang].errors[code] || words[lang].errors.default;
