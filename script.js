// ======================================================
// UTILIDADES
// ======================================================

function $(id) {
  return document.getElementById(id);
}

function setActivePanel(id) {
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.remove("active");
  });
  const panel = $(id);
  if (panel) panel.classList.add("active");
}

function normalizeText(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ======================================================
// CONFIGURAÇÃO (GATILHOS, IMAGEM ETC.)
// ======================================================

const appConfig = {
  voiceTrigger: "axis",
  searchTrigger: "axis",
  springboardImageData: "", // base64 da imagem escolhida da galeria
};

function loadConfigFromStorage() {
  try {
    const raw = localStorage.getItem("nomeweb_config");
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(appConfig, data);
  } catch (e) {
    console.warn("Erro ao carregar config:", e);
  }
}

function saveConfigToStorage() {
  try {
    localStorage.setItem("nomeweb_config", JSON.stringify(appConfig));
  } catch (e) {
    console.warn("Erro ao salvar config:", e);
  }
}

function applyConfigToUI() {
  if ($("voiceTriggerLabel")) {
    $("voiceTriggerLabel").innerText = appConfig.voiceTrigger;
  }

  if ($("inputVoiceTrigger")) {
    $("inputVoiceTrigger").value = appConfig.voiceTrigger;
  }
  if ($("inputSearchTrigger")) {
    $("inputSearchTrigger").value = appConfig.searchTrigger;
  }

  // Imagem do SpringBoard
  const springboard = document.querySelector(".springboard");
  if (springboard) {
    if (appConfig.springboardImageData) {
      springboard.style.backgroundImage = `url("${appConfig.springboardImageData}")`;
      springboard.style.backgroundSize = "cover";
      springboard.style.backgroundPosition = "center";
    } else {
      springboard.style.backgroundImage = "";
    }
  }
}

// ======================================================
// GRUPOS DE PALAVRAS – PREENCHA AQUI
// ======================================================

const GROUP_WORDS = {
  // pequenas feito pelo homem
  pequenas_feito_pelo_homem: [
    // coloque aqui até ~50 palavras
  ],

  // grandes feitas pelo homem
  grandes_feitas_pelo_homem: [
    // ...
  ],

  // pequenos naturais
  pequenos_naturais: [
    // ...
  ],

  // grandes naturais
  grandes_naturais: [
    // ...
  ],
};

function getWordsForGroup(groupKey) {
  if (!groupKey) {
    return Object.values(GROUP_WORDS).flat();
  }
  return GROUP_WORDS[groupKey] || [];
}

function uniqueWords(list) {
  return [...new Set(list)];
}

// ======================================================
// FORMATO DA PRIMEIRA LETRA (RETAS / CURVAS / MISTAS)
// COM SOBREPOSIÇÃO (como você pediu)
// ======================================================

const SHAPE_SETS = {
  retas: "AEFHI KLMNT VWXYZ",
  mistas: "BDGPQ RJ",
  curvas: "CGJ OQSU",
};

const SHAPE_MAP = (function () {
  const map = {};
  for (const [shape, lettersStr] of Object.entries(SHAPE_SETS)) {
    const letters = lettersStr.replace(/\s+/g, "").split("");
    letters.forEach((ch) => {
      const up = ch.toUpperCase();
      if (!map[up]) map[up] = new Set();
      map[up].add(shape);
    });
  }
  return map;
})();

function letterMatchesShape(letter, shape) {
  if (!shape) return true;
  if (!letter) return false;
  const up = letter.toUpperCase();
  const shapes = SHAPE_MAP[up];
  if (!shapes) return false;
  return shapes.has(shape);
}

// ======================================================
// RECONHECIMENTO DE VOZ (WEB SPEECH API)
// ======================================================

let globalRecognition = null;
let voiceBusy = false;

function getSpeechRecognition() {
  if (globalRecognition) return globalRecognition;
  const SR =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;
  if (!SR) {
    console.warn("SpeechRecognition não suportado");
    return null;
  }
  const rec = new SR();
  rec.lang = "pt-BR";
  rec.interimResults = false;
  rec.continuous = false;
  globalRecognition = rec;
  return rec;
}

function listenOnce(statusElement, onText) {
  const rec = getSpeechRecognition();
  if (!rec) {
    if (statusElement) {
      statusElement.innerText =
        "Seu navegador não suporta reconhecimento de voz.";
    }
    return;
  }
  if (voiceBusy) {
    if (statusElement) statusElement.innerText = "Reconhecimento já está ativo.";
    return;
  }

  voiceBusy = true;
  if (statusElement) statusElement.innerText = "Ouvindo…";

  rec.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((res) => res[0].transcript)
      .join(" ");
    voiceBusy = false;
    if (statusElement) statusElement.innerText = "Capturado.";
    onText(transcript);
  };

  rec.onerror = (e) => {
    console.warn("Erro recognition:", e);
    voiceBusy = false;
    if (statusElement) statusElement.innerText = "Erro ao ouvir. Tente de novo.";
  };

  rec.onend = () => {
    if (voiceBusy) {
      voiceBusy = false;
      if (statusElement) statusElement.innerText = "Parado.";
    }
  };

  rec.start();
}

function stopListening(statusElement) {
  const rec = getSpeechRecognition();
  if (rec && voiceBusy) {
    rec.stop();
    voiceBusy = false;
    if (statusElement) statusElement.innerText = "Parado.";
  }
}

// Extrai a palavra após o gatilho
function extractKeywordAfterTrigger(transcript, trigger) {
  const norm = normalizeText(transcript);
  const words = norm.split(/\s+/).filter(Boolean);
  const t = normalizeText(trigger || "");
  const idx = words.indexOf(t);
  let keyword = "";

  if (idx >= 0 && idx + 1 < words.length) {
    keyword = words[idx + 1];
  } else if (words.length > 0) {
    keyword = words[words.length - 1];
  }

  return keyword;
}

// Pesquisa no Google REAL (nova aba)
function openGoogleForKeyword(keyword) {
  if (!keyword) return;
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;
  window.open(url, "_blank"); // mantém o app aberto
}

// Modo voz e modo pesquisa usam isso
function handleVoiceSearch(transcript, trigger, statusElement) {
  const keyword = extractKeywordAfterTrigger(transcript, trigger);
  if (!keyword) {
    if (statusElement)
      statusElement.innerText = "Não encontrei palavra após o gatilho.";
    return;
  }
  if (statusElement) {
    statusElement.innerText = `Pesquisando: "${keyword}"...`;
  }
  openGoogleForKeyword(keyword);
}

// ======================================================
// MODO BINÁRIO – MODELO 1 (comprimento da palavra)
// ======================================================

const binaryState = {
  length: 0, // número de swipes = número mínimo de letras
  shape: null, // "retas" | "curvas" | "mistas"
  groupKey: "",
  candidates: [],
  inShapeMode: false,
};

function resetBinaryState() {
  binaryState.length = 0;
  binaryState.shape = null;
  binaryState.groupKey = "";
  binaryState.candidates = [];
  binaryState.inShapeMode = false;
}

let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 30;

let lastShapeSwipeTime = 0;
let lastShapeDirection = null;

// lista atual que está visível / usada no springboard
let springboardCurrentCandidates = [];
let originalIconLabels = [];
let overlayVisible = false;
let longPressTimer = null;
let bestLetterPosition = null;

function computeBinaryCandidates() {
  // começa do grupo atual (ou todos)
  const words = getWordsForGroup(binaryState.groupKey);
  const minLen = binaryState.length || 0;

  let filtered = words;

  if (minLen > 0) {
    filtered = filtered.filter((w) => w.length >= minLen);
  }

  if (binaryState.shape) {
    filtered = filtered.filter((w) => {
      if (!w || !w.length) return false;
      const first = w[0];
      return letterMatchesShape(first, binaryState.shape);
    });
  }

  binaryState.candidates = uniqueWords(filtered);
}

function syncBinaryToSpringboard() {
  springboardCurrentCandidates = [...binaryState.candidates];
  renderSpringboardResults();
  computeBestLetterPosition();
}

function setupBinarySwipes() {
  const panel = $("binaryPanel");
  if (!panel) return;

  panel.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    },
    { passive: true }
  );

  panel.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;

      if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
        return;
      }

      // Enquanto ainda não entrou no modo de formato
      if (!binaryState.inShapeMode && !binaryState.shape) {
        // Swipes verticais contam letras (não importa direção)
        if (Math.abs(dy) > Math.abs(dx)) {
          binaryState.length += 1;
          return;
        }

        // Swipe pra direita = troca para modo "formato"
        if (dx > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          binaryState.inShapeMode = true;
          lastShapeDirection = null;
          lastShapeSwipeTime = 0;
          return;
        }

        // Outros swipes são ignorados
        return;
      }

      // Já está no modo de formato
      if (binaryState.inShapeMode && !binaryState.shape) {
        handleShapeSwipe(dx, dy);
      }
    },
    { passive: true }
  );
}

function handleShapeSwipe(dx, dy) {
  const now = Date.now();
  let direction = null;

  if (Math.abs(dy) > Math.abs(dx)) {
    direction = dy < 0 ? "up" : "down";
  } else {
    direction = dx > 0 ? "right" : "left";
  }

  // Duplo swipe pra cima rápido => mistas
  if (
    direction === "up" &&
    lastShapeDirection === "up" &&
    now - lastShapeSwipeTime < 400
  ) {
    binaryState.shape = "mistas";
    binaryState.inShapeMode = false;
    finalizeBinaryInput();
    lastShapeDirection = null;
    lastShapeSwipeTime = 0;
    return;
  }

  if (direction === "up") {
    binaryState.shape = "retas";
    binaryState.inShapeMode = false;
    finalizeBinaryInput();
  } else if (direction === "down") {
    binaryState.shape = "curvas";
    binaryState.inShapeMode = false;
    finalizeBinaryInput();
  }

  lastShapeDirection = direction;
  lastShapeSwipeTime = now;
}

function finalizeBinaryInput() {
  computeBinaryCandidates();
  syncBinaryToSpringboard();
  setActivePanel("springboardPanel");
}

// ======================================================
// SPRINGBOARD – ÍCONES, LABELS, OVERLAY, FILTROS
// ======================================================

function captureOriginalIconLabels() {
  const labels = document.querySelectorAll(
    "#springboardPanel .icon .icon-label"
  );
  originalIconLabels = Array.from(labels).map((l) => l.textContent || "");
}

function getCurrentCandidates() {
  if (springboardCurrentCandidates && springboardCurrentCandidates.length) {
    return springboardCurrentCandidates;
  }
  return binaryState.candidates || [];
}

function renderSpringboardResults() {
  const icons = document.querySelectorAll("#springboardPanel .icon");
  const labels = Array.from(icons).map((icon) =>
    icon.querySelector(".icon-label")
  );

  const words = uniqueWords(getCurrentCandidates());

  labels.forEach((label, i) => {
    const original = originalIconLabels[i] || label.textContent || "";
    const word = words[i];
    if (word) {
      label.textContent = word;
    } else {
      // se não tiver palavra, mantém o nome real
      label.textContent = original;
    }
  });
}

function computeBestLetterPosition() {
  const candidates = getCurrentCandidates();

  if (!candidates || candidates.length === 0) {
    bestLetterPosition = null;
    if ($("statusNetwork")) $("statusNetwork").innerText = "5G";
    return;
  }

  let maxLen = 0;
  candidates.forEach((w) => {
    if (w.length > maxLen) maxLen = w.length;
  });

  let bestPos = null;
  let bestVariety = 0;

  for (let pos = 0; pos < maxLen; pos++) {
    const letters = new Set();
    candidates.forEach((w) => {
      const norm = normalizeText(w);
      if (pos < norm.length) letters.add(norm[pos]);
    });
    if (letters.size > bestVariety && letters.size > 1) {
      bestVariety = letters.size;
      bestPos = pos;
    }
  }

  if (bestPos == null) {
    bestLetterPosition = null;
    if ($("statusNetwork")) $("statusNetwork").innerText = "5G";
    return;
  }

  bestLetterPosition = bestPos;
  const displayPos = bestPos + 1;
  if ($("statusNetwork")) $("statusNetwork").innerText = displayPos + "G";
}

function askLetterAndFilter(letter) {
  const candidates = getCurrentCandidates();
  if (!candidates || candidates.length === 0) return;

  if (bestLetterPosition == null) {
    alert("Não foi possível sugerir uma letra. Mantendo 5G.");
    return;
  }

  const normLetter = normalizeText(letter || "")[0];
  if (!normLetter) return;

  const filtered = candidates.filter((w) => {
    const norm = normalizeText(w);
    if (bestLetterPosition >= norm.length) return false;
    return norm[bestLetterPosition] === normLetter;
  });

  springboardCurrentCandidates = filtered;
  binaryState.candidates = filtered;
  renderSpringboardResults();
  computeBestLetterPosition();
}

function setupSpringboardActions() {
  const icons = document.querySelectorAll("#springboardPanel .icon");
  icons.forEach((icon) => {
    const action = icon.dataset.action;
    if (!action) return;
    icon.addEventListener("click", () => {
      handleSpringboardAction(action);
    });
  });
}

function handleSpringboardAction(action) {
  switch (action) {
    case "filterVoice":
      // Usa modo voz para uma filtragem mental (não altera lista aqui)
      listenOnce($("voiceStatus"), (txt) => {
        console.log("[SpringBoard Voice] Texto:", txt);
      });
      break;

    case "filterLetter":
      // XG já está calculado; você usa prompt manualmente
      if (bestLetterPosition == null) {
        computeBestLetterPosition();
      }
      if (bestLetterPosition == null) return;
      const letra = prompt(
        `Qual é a letra na posição ${bestLetterPosition + 1}?`
      );
      if (!letra) return;
      askLetterAndFilter(letra);
      break;

    case "filterGroupSmallMan":
      binaryState.groupKey = "pequenas_feito_pelo_homem";
      computeBinaryCandidates();
      syncBinaryToSpringboard();
      break;

    case "filterGroupBigMan":
      binaryState.groupKey = "grandes_feitas_pelo_homem";
      computeBinaryCandidates();
      syncBinaryToSpringboard();
      break;

    case "filterGroupSmallNat":
      binaryState.groupKey = "pequenos_naturais";
      computeBinaryCandidates();
      syncBinaryToSpringboard();
      break;

    case "filterGroupBigNat":
      binaryState.groupKey = "grandes_naturais";
      computeBinaryCandidates();
      syncBinaryToSpringboard();
      break;

    case "showFinal":
      renderSpringboardResults();
      break;

    default:
      break;
  }
}

// ======================================================
// OVERLAY (LONG PRESS) – MOSTRAR TODAS AS PALAVRAS
// ======================================================

function showOverlay() {
  const overlay = $("overlayPanel");
  const list = $("overlayList");
  if (!overlay || !list) return;

  const candidates = getCurrentCandidates();
  list.textContent = candidates.join("\n");
  overlay.style.display = "flex";
  overlayVisible = true;
}

function hideOverlay() {
  const overlay = $("overlayPanel");
  if (!overlay) return;
  overlay.style.display = "none";
  overlayVisible = false;
}

function setupOverlayHandlers() {
  const panel = $("springboardPanel");
  if (!panel) return;

  panel.addEventListener(
    "touchstart",
    () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        showOverlay();
      }, 500);
    },
    { passive: true }
  );

  const cancelOverlayTouch = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (overlayVisible) {
      hideOverlay();
    }
  };

  panel.addEventListener("touchend", cancelOverlayTouch, { passive: true });
  panel.addEventListener("touchcancel", cancelOverlayTouch, { passive: true });
}

// ======================================================
// DOCK – VOICE GOOGLE (ESQUERDA) E FILTRO XG POR VOZ (DIREITA)
// ======================================================

function setupDockActions() {
  const docks = document.querySelectorAll(".dock-icon");
  docks.forEach((dock) => {
    const action = dock.dataset.dockAction;
    if (!action) return;
    dock.addEventListener("click", () => {
      handleDockAction(action);
    });
  });
}

function handleDockAction(action) {
  switch (action) {
    case "voiceGoogle": {
      // Botão inferior esquerdo: pesquisa de voz do Google (modo voz direto)
      listenOnce(null, (txt) => {
        const keyword = extractKeywordAfterTrigger(
          txt,
          appConfig.voiceTrigger
        );
        openGoogleForKeyword(keyword);
      });
      break;
    }

    case "voiceLetterFilter": {
      // Botão inferior direito:
      // 1) Use XG atual (bestLetterPosition)
      // 2) Escuta voz, pega palavra após gatilho
      // 3) Abre Google REAL com essa palavra
      // 4) Usa a primeira letra dessa palavra para filtrar candidatos na posição XG
      if (bestLetterPosition == null) {
        computeBestLetterPosition();
      }
      if (bestLetterPosition == null) {
        alert("Nenhuma posição XG disponível ainda.");
        return;
      }

      listenOnce(null, (txt) => {
        const keyword = extractKeywordAfterTrigger(
          txt,
          appConfig.voiceTrigger
        );
        if (!keyword) return;

        // Abre Google antes ou depois, tanto faz – estado do app continua.
        openGoogleForKeyword(keyword);

        const norm = normalizeText(keyword);
        const firstLetter = norm[0];
        if (!firstLetter) return;

        askLetterAndFilter(firstLetter);
      });
      break;
    }

    default:
      break;
  }
}

// ======================================================
// MODO PESQUISA – TELA FAKE GOOGLE
// ======================================================

function setupSearchMode() {
  const bar = $("fakeSearchBar");
  if (!bar) return;
  bar.addEventListener("click", () => {
    $("fakeSearchText").innerText = "";
    listenOnce($("searchVoiceStatus"), (txt) => {
      handleVoiceSearch(
        txt,
        appConfig.searchTrigger,
        $("searchVoiceStatus")
      );
    });
  });
}

// ======================================================
// NAVEGAÇÃO / EVENTOS
// ======================================================

function setupNavigation() {
  // Home
  $("btnGoPerformance").addEventListener("click", () => {
    setActivePanel("performancePanel");
  });

  $("btnGoSettings").addEventListener("click", () => {
    setActivePanel("settingsPanel");
  });

  // Voltar genérico -> sempre home (layout A)
  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActivePanel("homePanel");
    });
  });

  // Performance -> modos
  $("btnModeVoice").addEventListener("click", () => {
    setActivePanel("voicePanel");
  });

  $("btnModeBinary").addEventListener("click", () => {
    resetBinaryState();
    setActivePanel("binaryPanel");
  });

  $("btnModeSearch").addEventListener("click", () => {
    setActivePanel("searchPanel");
  });

  // Modo Voz
  $("btnVoiceStart").addEventListener("click", () => {
    listenOnce($("voiceStatus"), (txt) => {
      handleVoiceSearch(txt, appConfig.voiceTrigger, $("voiceStatus"));
    });
  });

  $("btnVoiceStop").addEventListener("click", () => {
    stopListening($("voiceStatus"));
  });

  // Configurações – salvar
  $("btnSaveSettings").addEventListener("click", () => {
    appConfig.voiceTrigger = $("inputVoiceTrigger").value.trim() || "axis";
    appConfig.searchTrigger = $("inputSearchTrigger").value.trim() || "axis";
    saveConfigToStorage();
    applyConfigToUI();
    alert("Configurações salvas!");
  });

  // Configurações – escolher imagem da galeria
  $("btnChooseSpringboardImage").addEventListener("click", () => {
    $("springboardFilePicker").click();
  });

  $("springboardFilePicker").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result; // data URL da imagem
      appConfig.springboardImageData = base64;
      saveConfigToStorage();
      applyConfigToUI();
    };
    reader.readAsDataURL(file);
  });
}

// ======================================================
// RELÓGIO FAKE
// ======================================================

function setupFakeClock() {
  function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    if ($("statusTime")) {
      $("statusTime").innerText = `${hh}:${mm}`;
    }
  }
  updateClock();
  setInterval(updateClock, 60000);
}

// ======================================================
// INIT
// ======================================================

document.addEventListener("DOMContentLoaded", () => {
  loadConfigFromStorage();
  applyConfigToUI();
  captureOriginalIconLabels();
  setupNavigation();
  setupBinarySwipes();
  setupSpringboardActions();
  setupDockActions();
  setupOverlayHandlers();
  setupSearchMode();
  setupFakeClock();
});
