// The clusters tab's words, in Persian and English (kept here so the tab stays in one folder).
import { errorText } from "../i18n.js";

const words = {
  fa: {
    myClusters: "خوشه‌های من", noClusters: "هنوز در هیچ خوشه‌ای نیستی. یکی بساز.", newCluster: "خوشه جدید", clusterName: "اسم خوشه",
    tasksN: (n) => `${fmt(n)} کار`, yourColor: "رنگ تو", clusters: "خوشه‌ها",
    members: "اعضا", fields: "فیلدها", settings: "تنظیمات خوشه",
    editStatuses: "ویرایش وضعیت‌ها", onlyMine: "فقط کارهای من", emptyColumn: "کاری اینجا نیست", newTask: "+ کار تازه", taskPh: "اسم کار…",
    move: "جابه‌جا کردن", movedTo: (n) => `رفت به «${n}»`, rename: "تغییر اسم",
    columnName: "اسم وضعیت", add: "افزودن", changeColor: "تغییر رنگ", delColumn: "حذف وضعیت",
    delColumnQ: (n, k) => `وضعیت «${n}» و ${fmt(k)} کارش پاک شود؟`,
    task: "کار", taskName: "اسم کار", status: "وضعیت", memberNote: "فقط ادمین‌ها کار را ویرایش می‌کنند؛ تو می‌توانی جابه‌جایش کنی و مراحلش را تیک بزنی.",
    noFieldsYet: "این خوشه هنوز فیلدی ندارد. از «فیلدها» اضافه کن.", delTask: "حذف کار", deleted: (n) => `«${n}» حذف شد`, undo: "برگردان",
    empty: "خالی", checkOn: "انجام شد", checkOff: "انجام نشده", stepPh: "مرحله تازه…", openLink: "باز کردن لینک", edit: "ویرایش",
    remind: "یادآوری", remNone: "نه", remBefore: "یک روز قبل", remSame: "همان روز",
    today: "امروز", tomorrow: "فردا", clearDate: "پاک کردن", day: "روز", month: "ماه", year: "سال",
    willBeNotified: (n) => `به ${n} خبر می‌دهیم`,
    onlyName: "هر کار فعلاً فقط اسم دارد. فیلدی بساز: مسئول، مهلت، نوع، مراحل…",
    addField: "فیلد تازه", fieldName: "اسم فیلد", options: "گزینه‌ها", optPh: "گزینه تازه…", multi: "چند انتخابی",
    delFieldQ: (n) => `فیلد «${n}» و مقدارهایش در همه کارها پاک شود؟`,
    t_text: "متن", t_number: "عدد", t_phone: "تلفن", t_link: "لینک", t_select: "انتخابی", t_assign: "مسئول", t_date: "تاریخ", t_check: "تیک", t_checklist: "مراحل",
    owner: "مالک", admin: "ادمین", member: "عضو", you: "تو", makeAdmin: "ادمین کن", makeMember: "عضو عادی کن", remove: "حذف",
    removeQ: (n) => `${n} از این خوشه حذف شود؟`, addMember: "افزودن از اعضای ورک‌اسپیس", allIn: "همه اعضای ورک‌اسپیس در این خوشه هستند.",
    addHint: "اینجا فقط اعضای ورک‌اسپیس می‌آیند؛ دعوت آدم تازه از تب «تیم و تقویم» است.",
    delCluster: "حذف خوشه", delClusterQ: "این خوشه و همه کارهایش برای همیشه پاک شود؟", leave: "خروج از خوشه", leaveQ: "از این خوشه خارج شوی؟",
    ownerOnly: "اسم و حذف خوشه دست مالک است.", close: "بستن", done: "تمام", saved: "ذخیره شد",
    errors: { not_in_workspace: "این آدم عضو ورک‌اسپیس نیست.", last_column: "خوشه دست‌کم یک وضعیت لازم دارد.", use_leave: "برای خودت از «خروج» استفاده کن." },
  },
  en: {
    myClusters: "My clusters", noClusters: "You're not in any cluster yet. Make one.", newCluster: "New cluster", clusterName: "Cluster name",
    tasksN: (n) => `${fmt(n)} task${n === 1 ? "" : "s"}`, yourColor: "Your colour", clusters: "Clusters",
    members: "Members", fields: "Fields", settings: "Cluster settings",
    editStatuses: "Edit statuses", onlyMine: "Only mine", emptyColumn: "Nothing here", newTask: "+ New task", taskPh: "Task name…",
    move: "Move", movedTo: (n) => `Moved to "${n}"`, rename: "Rename",
    columnName: "Status name", add: "Add", changeColor: "Change colour", delColumn: "Delete status",
    delColumnQ: (n, k) => `Delete status "${n}" and its ${fmt(k)} tasks?`,
    task: "Task", taskName: "Task name", status: "Status", memberNote: "Only admins edit tasks; you can move them and tick their steps.",
    noFieldsYet: "This cluster has no fields yet. Add some under Fields.", delTask: "Delete task", deleted: (n) => `"${n}" deleted`, undo: "Undo",
    empty: "Empty", checkOn: "Done", checkOff: "Not done", stepPh: "New step…", openLink: "Open link", edit: "Edit",
    remind: "Reminder", remNone: "No", remBefore: "A day before", remSame: "On the day",
    today: "Today", tomorrow: "Tomorrow", clearDate: "Clear", day: "Day", month: "Month", year: "Year",
    willBeNotified: (n) => `${n} will be told`,
    onlyName: "Tasks only have a name for now. Add a field: owner, due date, kind, steps…",
    addField: "New field", fieldName: "Field name", options: "Options", optPh: "New option…", multi: "Several choices",
    delFieldQ: (n) => `Delete field "${n}" and its values in every task?`,
    t_text: "Text", t_number: "Number", t_phone: "Phone", t_link: "Link", t_select: "Choice", t_assign: "Assignee", t_date: "Date", t_check: "Tick", t_checklist: "Steps",
    owner: "Owner", admin: "Admin", member: "Member", you: "you", makeAdmin: "Make admin", makeMember: "Make member", remove: "Remove",
    removeQ: (n) => `Remove ${n} from this cluster?`, addMember: "Add from the workspace", allIn: "Everyone in the workspace is in this cluster.",
    addHint: "Only workspace members can be added; invite new people from the Team tab.",
    delCluster: "Delete cluster", delClusterQ: "Delete this cluster and all its tasks for good?", leave: "Leave cluster", leaveQ: "Leave this cluster?",
    ownerOnly: "Only the owner renames or deletes the cluster.", close: "Close", done: "Done", saved: "Saved",
    errors: { not_in_workspace: "They're not in the workspace.", last_column: "A cluster needs at least one status.", use_leave: "Use Leave for yourself." },
  },
};

const lang = () => (document.documentElement.lang === "en" ? "en" : "fa");
/** A number in the page's digits. @param {number} n */
export const fmt = (n) => Number(n).toLocaleString(lang() === "fa" ? "fa-IR" : "en-US");

/** @param {string} key @returns {any} */
export const w = (key) => words[lang()][key];

/** The message for an error code, the tab's own first. @param {any} e */
export const errText = (e) => {
  const code = e?.message || String(e);
  return words[lang()].errors[code] || errorText(code);
};
