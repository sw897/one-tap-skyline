const shanghai = 'Asia/Shanghai';
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: shanghai, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: shanghai, year: 'numeric', month: 'long', day: 'numeric',
});
const weekdayFormat = new Intl.DateTimeFormat('zh-CN', {timeZone: shanghai, weekday: 'long'});

export function mountDisplayClock(root: HTMLElement): () => void {
  const panel = root.querySelector<HTMLElement>('#display-clock')!;
  const time = root.querySelector<HTMLTimeElement>('#display-time')!;
  const date = root.querySelector<HTMLElement>('#display-date')!;
  let timer: ReturnType<typeof setInterval> | undefined;
  const update = () => {
    const now = new Date();
    time.textContent = timeFormat.format(now);
    time.dateTime = now.toISOString();
    date.textContent = `${dateFormat.format(now)} ${weekdayFormat.format(now)}`;
  };
  const visibility = () => {
    clearInterval(timer);
    timer = undefined;
    if (document.hidden) return;
    update();
    timer = setInterval(update, 1000);
  };
  panel.hidden = false;
  visibility();
  document.addEventListener('visibilitychange', visibility);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', visibility);
    panel.hidden = true;
  };
}
