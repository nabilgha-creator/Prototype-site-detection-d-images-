// ====== Elements DOM ======
const urlInput = document.getElementById("urlInput");
const detectBtn = document.getElementById("detectBtn");
const statusEl = document.getElementById("status");
const imgEl = document.getElementById("img");
const listEl = document.getElementById("list");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");
const fileBtn = document.getElementById("fileBtn");
const fileName = document.getElementById("fileName");



// ====== Helpers UI ======
function setStatus(text) {
  statusEl.textContent = text || "";
}

function clearAll() {
  listEl.innerHTML = "";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function looksLikeImageUrl(url) {
  try {
    const u = new URL(url);

    // 1) extension dans le chemin (/truc.jpg)
    const pathOk = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(u.pathname);

    // 2) ou format dans les params (?format=jpg ou ?fm=jpg)
    const fmt = (u.searchParams.get("format") || u.searchParams.get("fm") || "").toLowerCase();
    const fmtOk = /^(png|jpe?g|webp|gif|bmp|svg)$/.test(fmt);

    return pathOk || fmtOk;
  } catch {
    return false;
  }
}


// ====== Model (load once) ======
let model = null;

async function loadModel() {
  if (model) return model;
  setStatus("Chargement modèle…");
  model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
  return model;
}

// ====== Image loading ======
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const viewer = document.querySelector(".viewer");

    // reset placeholder avant de charger
    viewer.classList.remove("has-image");

    imgEl.crossOrigin = "anonymous"; // si l'image autorise CORS

    imgEl.onload = () => {
      viewer.classList.add("has-image");
      resolve(imgEl); // ✅ IMPORTANT : resolve ici
    };

    imgEl.onerror = () => {
      viewer.classList.remove("has-image");
      reject(new Error("Image impossible à charger (URL invalide / pas une image / CORS)."));
    };

    imgEl.src = url; // ⚠️ doit être après onload/onerror
  });
}


// ====== Bounding boxes alignées (même si object-fit: contain) ======
function getRenderedImageRect(img) {
  const rect = img.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  // image affichée en "contain" dans le rectangle cw/ch
  const scale = Math.min(cw / iw, ch / ih);
  const renderedW = iw * scale;
  const renderedH = ih * scale;

  const offsetX = (cw - renderedW) / 2;
  const offsetY = (ch - renderedH) / 2;

  return { cw, ch, scale, offsetX, offsetY };
}

function fitCanvasToImage() {
  const rect = imgEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  // Important : on dessine en "pixels CSS"
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw(predictions) {
  fitCanvasToImage();

  const rect = imgEl.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const { scale, offsetX, offsetY } = getRenderedImageRect(imgEl);

  ctx.lineWidth = 2;
  ctx.font = "16px Arial";

  predictions.forEach(p => {
    const [x, y, w, h] = p.bbox;

    const sx = offsetX + x * scale;
    const sy = offsetY + y * scale;
    const sw = w * scale;
    const sh = h * scale;

    ctx.strokeRect(sx, sy, sw, sh);

    const label = `${p.class} ${(p.score * 100).toFixed(0)}%`;
    const tw = ctx.measureText(label).width;
    const th = 18;

    ctx.fillRect(sx, Math.max(0, sy - th), tw + 8, th);
    ctx.fillStyle = "white";
    ctx.fillText(label, sx + 4, Math.max(14, sy - 4));
    ctx.fillStyle = "black";
  });
}

function renderList(predictions) {
  listEl.innerHTML = "";
  predictions.forEach(p => {
    const li = document.createElement("li");
    li.textContent = `${p.class} — ${(p.score * 100).toFixed(1)}%`;
    listEl.appendChild(li);
  });
}

// (optionnel) garder les dernières prédictions pour redraw sur resize
let lastPreds = [];

window.addEventListener("resize", () => {
  if (lastPreds.length) draw(lastPreds);
});

// ====== Click Detect ======
detectBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) return;

  // évite les URL de pages (google search, etc.)
  if (!looksLikeImageUrl(url)) {
    setStatus("Mets une URL DIRECTE d’image (.jpg/.png/.webp), pas une page web.");
    return;
  }

  detectBtn.disabled = true;
  clearAll();

  try {
    await loadModel();

    setStatus("Chargement image…");
    await loadImage(url);

    setStatus("Détection…");
    const preds = await model.detect(imgEl, 20, 0.5); // max 20 boxes, score min 0.5

    lastPreds = preds;

    setStatus(`OK (${preds.length} objets)`);
    renderList(preds);
    draw(preds);
  } catch (e) {
    setStatus("Erreur: " + e.message);
    console.error(e);
  } finally {
    detectBtn.disabled = false;
  }
});

console.log("script-img.js chargé ✅");

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  detectBtn.disabled = true;
  clearAll();

  try {
    await loadModel();
    setStatus("Chargement image (fichier local)…");

    // crée une URL locale temporaire (pas de CORS)
    const localUrl = URL.createObjectURL(file);

    await loadImage(localUrl);

    setStatus("Détection…");
    const preds = await model.detect(imgEl, 20, 0.5);

    setStatus(`OK (${preds.length} objets)`);
    renderList(preds);
    draw(preds);

    // libère la mémoire
    URL.revokeObjectURL(localUrl);
  } catch (e) {
    setStatus("Erreur: " + e.message);
    console.error(e);
  } finally {
    detectBtn.disabled = false;
    // optionnel : permettre de re-sélectionner le même fichier
    fileInput.value = "";
  }
});

fileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  fileName.textContent = file.name;

  detectBtn.disabled = true;
  clearAll();

  try {
    await loadModel();
    setStatus("Chargement image (local)…");

    const localUrl = URL.createObjectURL(file);
    await loadImage(localUrl);

    setStatus("Détection…");
    const preds = await model.detect(imgEl, 20, 0.5);

    setStatus(`OK (${preds.length} objets)`);
    renderList(preds);
    draw(preds);

    URL.revokeObjectURL(localUrl);
  } catch (e) {
    setStatus("Erreur: " + e.message);
    console.error(e);
  } finally {
    detectBtn.disabled = false;
  }
});
