// Every word the pages show, in Persian and English.
const words = {
  fa: {
    signOut: "خروج",
    display: "نام نمایشی", email: "ایمیل (اختیاری)", about: "درباره من",
    profile: "پروفایل", save: "ذخیره", saved: "ذخیره شد",
    lang: "زبان", cal: "تقویم", shamsi: "شمسی", gregorian: "میلادی", weekStart: "شروع هفته",
    sat: "شنبه", sun: "یکشنبه", mon: "دوشنبه",
    myWorkspaces: "فضاهای کار من", noWorkspaces: "هنوز در هیچ فضای کاری نیستی. یکی بساز یا با لینک دعوت وارد شو.",
    newWorkspace: "فضای کار جدید", workspaceName: "اسم فضای کار", icon: "نماد (یک ایموجی، اختیاری)", create: "ساختن", cancel: "لغو",
    members: (n) => `${n.toLocaleString("fa-IR")} عضو`, invitedYou: "تو را دعوت کرده‌اند", accept: "قبول", decline: "رد",
    back: "فضاهای کار",
    tabTeam: "تیم و تقویم", tabClusters: "خوشه‌ها", tabDocs: "اندوخته‌ها",
    comingSoon: "این تب در مرحله بعد ساخته می‌شود.",
    team: "اعضا", owner: "مالک", admin: "ادمین", member: "عضو", pending: "در انتظار پذیرش",
    makeAdmin: "ادمین کن", makeMember: "عضو عادی کن", remove: "حذف", withdraw: "پس گرفتن دعوت",
    inviteTitle: "دعوت", inviteUsername: "نام کاربری", invite: "دعوت کن", invited: "دعوت فرستاده شد",
    lastingLink: "لینک دائمی", linkName: "اسم لینک (اختیاری)", setName: "ثبت اسم", resetLink: "لینک تازه",
    onceLink: "لینک یک‌بارمصرف (یک هفته)", makeOnce: "ساختن", copy: "کپی", copied: "کپی شد",
    roles: "نقش‌های تیم", newRole: "نقش تازه", add: "افزودن", noRoles: "هنوز نقشی تعریف نشده.",
    settings: "تنظیمات فضای کار", rename: "تغییر اسم", deleteWs: "حذف فضای کار", leave: "خروج از فضای کار",
    confirmDelete: "فضای کار و همه چیزش برای همیشه پاک شود؟", confirmLeave: "از این فضای کار خارج شوی؟", confirmRemove: "از فضای کار حذف شود؟",
    joinTitle: "دعوت به فضای کار", join: "ورود به فضای کار", alreadyIn: "عضو این فضای کار هستی.", open: "باز کردن",
    errors: {
      username_invalid: "نام کاربری باید ۳ تا ۲۰ حرف انگلیسی، عدد یا _ باشد.",
      username_taken: "این نام کاربری گرفته شده.",
      password_short: "رمز باید دست‌کم ۶ حرف باشد.",
      email_invalid: "ایمیل درست نیست.",
      wrong_login: "نام کاربری یا رمز درست نیست.",
      telegram_username_empty: "یوزرنیم تلگرام را بنویس.",
      telegram_not_started: "اول ربات را در تلگرام استارت کن.",
      telegram_send_failed: "ربات نتوانست پیام بفرستد. ربات را دوباره استارت کن.",
      telegram_not_set_up: "ورود با تلگرام هنوز راه نیفتاده.",
      code_wait: "یک دقیقه صبر کن، بعد کد تازه بگیر.", code_expired: "کد منقضی شده. کد تازه بگیر.", code_wrong: "کد درست نیست.",
      signup_closed: "فعلاً ساخت حساب جدید بسته است.",
      telegram_not_member: "این حساب تلگرام به هیچ کاربری وصل نیست. با نام کاربری و رمز وارد شو.",
      too_many_attempts: "تلاش‌ها زیاد بود. چند دقیقه دیگر دوباره امتحان کن.",
      name_empty: "اسم نمی‌تواند خالی باشد.",
      no_such_user: "کسی با این نام کاربری پیدا نشد.",
      already_invited: "قبلاً دعوت شده.", already_member: "همین حالا عضو است.",
      workspace_full: "ظرفیت این فضای کار پر است.",
      slug_invalid: "اسم لینک: ۳ تا ۳۲ حرف انگلیسی کوچک، عدد یا خط تیره.", slug_taken: "این اسم لینک گرفته شده.",
      link_invalid: "این لینک دیگر کار نمی‌کند.", not_allowed: "اجازه این کار را نداری.", not_found: "پیدا نشد.",
      owner_cannot_leave: "مالک نمی‌تواند خارج شود.",
      offline: "اتصال برقرار نشد.",
      default: "مشکلی پیش آمد. دوباره امتحان کن.",
    },
  },
  en: {
    signOut: "Sign out",
    display: "Display name", email: "Email (optional)", about: "About me",
    profile: "Profile", save: "Save", saved: "Saved",
    lang: "Language", cal: "Calendar", shamsi: "Solar Hijri", gregorian: "Gregorian", weekStart: "Week starts on",
    sat: "Saturday", sun: "Sunday", mon: "Monday",
    myWorkspaces: "My workspaces", noWorkspaces: "You're not in any workspace yet. Create one, or join with an invite link.",
    newWorkspace: "New workspace", workspaceName: "Workspace name", icon: "Icon (one emoji, optional)", create: "Create", cancel: "Cancel",
    members: (n) => `${n} member${n === 1 ? "" : "s"}`, invitedYou: "You're invited", accept: "Accept", decline: "Decline",
    back: "Workspaces",
    tabTeam: "Team & calendar", tabClusters: "Clusters", tabDocs: "Docs",
    comingSoon: "This tab comes in the next phase.",
    team: "Members", owner: "Owner", admin: "Admin", member: "Member", pending: "Invited",
    makeAdmin: "Make admin", makeMember: "Make member", remove: "Remove", withdraw: "Withdraw invite",
    inviteTitle: "Invite", inviteUsername: "Username", invite: "Invite", invited: "Invite sent",
    lastingLink: "Lasting link", linkName: "Link name (optional)", setName: "Set name", resetLink: "New link",
    onceLink: "One-person link (one week)", makeOnce: "Make", copy: "Copy", copied: "Copied",
    roles: "Team roles", newRole: "New role", add: "Add", noRoles: "No roles yet.",
    settings: "Workspace settings", rename: "Rename", deleteWs: "Delete workspace", leave: "Leave workspace",
    confirmDelete: "Delete this workspace and everything in it for good?", confirmLeave: "Leave this workspace?", confirmRemove: "Remove from the workspace?",
    joinTitle: "Workspace invite", join: "Join workspace", alreadyIn: "You're already a member.", open: "Open",
    errors: {
      username_invalid: "Usernames are 3–20 letters, digits or _.",
      username_taken: "That username is taken.",
      password_short: "Passwords need at least 6 characters.",
      email_invalid: "That email doesn't look right.",
      wrong_login: "Wrong username or password.",
      telegram_username_empty: "Type your Telegram username.",
      telegram_not_started: "Start the bot in Telegram first.",
      telegram_send_failed: "The bot couldn't message you. Start it again.",
      telegram_not_set_up: "Telegram login isn't set up yet.",
      code_wait: "Wait a minute before asking for a new code.", code_expired: "The code has expired. Ask for a new one.", code_wrong: "Wrong code.",
      signup_closed: "New accounts are closed for now.",
      telegram_not_member: "This Telegram account isn't linked to any user. Sign in with your username and password.",
      too_many_attempts: "Too many tries. Try again in a few minutes.",
      name_empty: "The name can't be empty.",
      no_such_user: "Nobody has that username.",
      already_invited: "Already invited.", already_member: "Already a member.",
      workspace_full: "This workspace is full.",
      slug_invalid: "Link names are 3–32 lowercase letters, digits or dashes.", slug_taken: "That link name is taken.",
      link_invalid: "This link no longer works.", not_allowed: "You can't do that.", not_found: "Not found.",
      owner_cannot_leave: "The owner can't leave.",
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

/** A message that takes a value, like members(3). @param {"members"} key @param {number} n */
export const tn = (key, n) => words[lang][key](n);

/** The message for an error code from the server. @param {string} code */
export const errorText = (code) => words[lang].errors[code] || words[lang].errors.default;

/** The same in English, for the sign-in page. @param {string} code */
export const errorTextEn = (code) => words.en.errors[code] || words.en.errors.default;
