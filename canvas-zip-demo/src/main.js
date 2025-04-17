import JSZip from "jszip";

/* ---------- ユーティリティ ---------- */
const randLetter = () => String.fromCharCode(97 + Math.floor(Math.random() * 26));
const randString = () => Array.from({ length: 2 + Math.floor(Math.random() * 7) }, randLetter).join("");
const makeFilename = () => randLetter() + randString() + ".png";

/** Canvas で画像 Blob を作る */
async function makeImageBlob(letter) {
  const size = 256;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // 背景 (ランダム色)
  ctx.fillStyle = `hsl(\${Math.random() * 360},70%,70%)`;
  ctx.fillRect(0, 0, size, size);

  // テキスト
  ctx.font = "bold 64px sans-serif";
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter.toUpperCase(), size / 2, size / 2);

  return canvas.convertToBlob({ type: "image/png" });
}

/* ---------- メイン ---------- */
document.getElementById("go").addEventListener("click", async () => {
  const N = Number(document.getElementById("count").value) || 1;
  const zip = new JSZip();
  const preview = document.getElementById("preview");
  preview.innerHTML = "";

  await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const filename = makeFilename();  // 例: gtsqkj.png
      const first = filename[0];

      const blob = await makeImageBlob(first);
      zip.folder(first).file(filename, blob);

      if (i < 20) {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        img.onload = () => URL.revokeObjectURL(url);
        preview.appendChild(img);
      }
    })
  );

  const zipBlob = await zip.generateAsync({ type: "blob", streamFiles: true });
  const url = URL.createObjectURL(zipBlob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "images.zip" });
  a.click();
  URL.revokeObjectURL(url);
});
