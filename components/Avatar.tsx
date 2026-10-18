// Initial-letter avatar. The colour is derived from the handle, so a person always
// looks the same everywhere.
const TINTS = ["#dbe4ff", "#ffe3d6", "#d9f2e6", "#f3e1ff", "#fff0c2"];
const INKS = ["#2b4acb", "#b54708", "#067647", "#7a2ec2", "#8a6100"];

export function Avatar({ name, handle, size = 36 }: { name: string; handle: string; size?: number }) {
  const i = [...handle].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TINTS.length;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, background: TINTS[i], color: INKS[i], fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
