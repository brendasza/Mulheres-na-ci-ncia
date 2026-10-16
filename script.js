//  Personagens 
const SP = [
  { n: "Carolina Maria de Jesus", f: "img/carolina_frente.png", s: "img/carolina_lado.png", b: "img/carolina_costas.png" },
  { n: "Lélia Gonzalez", f: "img/lelia.png", s: "img/lelia.png", b: "img/lelia.png" },
  { n: "Djamila Ribeiro", f: "img/djamila_frente.png", s: "img/djamila_lado.png", b: "img/djamila_costas.png" },
];


const $ = id => document.getElementById(id);

// Embaralha uma lista (usado nas perguntas e nas alternativas)
const shuf = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

let G;            // estado do jogo atual
let qi = [];      // fila embaralhada de perguntas
let mute = false; 
let cur;          // contexto de áudio
let pd, gd;       // dados (sorteio inicial e dado do jogo)

function show(s) {
  document.querySelectorAll(".screen").forEach(e => e.classList.toggle("on", e.id == s));
}

// som
function tone(f, t, d, ty = "sine") {
  if (mute) return;
  cur = cur || new (window.AudioContext || window.webkitAudioContext)();
  const o = cur.createOscillator();
  const g = cur.createGain();
  o.type = ty;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.2, cur.currentTime + t);
  g.gain.exponentialRampToValueAtTime(0.001, cur.currentTime + t + d);
  o.connect(g);
  g.connect(cur.destination);
  o.start(cur.currentTime + t);
  o.stop(cur.currentTime + t + d);
}


const okS = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25));
const badS = () => {
  tone(220, 0, 0.3, "sawtooth");
  tone(150, 0.28, 0.5, "sawtooth");
};

//dado
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const ANG = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };

function mkDie(el) {
  el.className = "scene";
  el.innerHTML =
    '<div class="cube">' +
    [1, 2, 3, 4, 5, 6]
      .map(v => `<div class="face f${v}">` +
        [...Array(9).keys()].map(i => `<i class="${PIPS[v].includes(i) ? "pip" : ""}"></i>`).join("") +
        "</div>")
      .join("") +
    "</div>";
  const c = el.firstChild;
  let b = 0;
  c.style.transform = "rotateX(-25deg) rotateY(-30deg)";
  // el.roll(v) gira o dado e para no número v
  el.roll = v => {
    b += 720;
    c.style.transform = `rotateX(${ANG[v][0] + b}deg) rotateY(${ANG[v][1] + b}deg)`;
    for (let i = 0; i < 8; i++) tone(200 + i * 30, i * 0.14, 0.06, "square");
    return new Promise(r => setTimeout(r, 1300));
  };
  return el;
}
//tabuleiro
function P(b) {
  const WP = {
    1: [[0, 0], [9, 0], [9, 2], [0, 2], [0, 4], [9, 4], [9, 6], [0, 6]],
    2: [[0, 0], [0, 6], [2, 6], [2, 0], [4, 0], [4, 6], [6, 6], [6, 0], [8, 0], [8, 6], [10, 6], [10, 0]],
    3: [[0, 0], [8, 0], [8, 8], [0, 8], [0, 2], [6, 2], [6, 6], [2, 6], [2, 4], [4, 4]],
  }[b];
  const p = [WP[0]];
  WP.slice(1).forEach(t => {
    const a = p[p.length - 1];
    const dx = Math.sign(t[0] - a[0]);
    const dy = Math.sign(t[1] - a[1]);
    let x = a[0], y = a[1];
    while (x != t[0] || y != t[1]) {
      x += dx;
      y += dy;
      p.push([x, y]);
    }
  });
  return {
    p,
    C: Math.max(...p.map(q => q[0])) + 1, // número de colunas
    R: Math.max(...p.map(q => q[1])) + 1, // número de linhas
  };
}

// Tipo de cada casa: N = normal, F = fim, S = atalho, Q = pergunta
const T = (i, n) => (i == 0 ? "N" : i == n - 1 ? "F" : i % 6 == 4 ? "S" : i % 2 ? "Q" : "N");

//sorteio
function go(n) {
  if (typeof Q === "undefined" || !Q.length) {
    alert("Não encontrei as perguntas!\n\nConfira se o arquivo perguntas.js está na MESMA pasta do index.html, com esse nome exato, e se o texto foi colado inteiro.");
    return;
  }
  const b = P(n);
  G = {
    n,
    path: b.p,
    C: b.C,
    R: b.R,
    pl: SP.slice(0, n).map(c => ({ ...c, pos: 0, pts: 0, dir: "d" })),
    turn: 0,
    phase: "roll",
    steps: 0,
  };
  $("ph").textContent = n > 1 ? "Quem começa?" : "Sua personagem";
  $("chars").innerHTML = G.pl
    .map((p, i) => `<div class="pc" id="pc${i}"><img src="${p.f}"><div>${p.n}</div></div>`)
    .join("");
  $("pgo").style.display = "none";
  $("pd").innerHTML = "";
  if (n > 1) {
    pd = mkDie($("pd"));
    $("pinfo").textContent = `Clique no dado (1 a ${n}) para sortear quem começa!`;
    let busy = 0;
    pd.onclick = async () => {
      if (busy) return;
      busy = 1;
      const v = Math.random() * n + 1 | 0;
      await pd.roll(v);
      G.turn = v - 1;
      $("pc" + (v - 1)).classList.add("win");
      $("pinfo").textContent = `Tirou ${v}: ${G.pl[v - 1].n} começa!`;
      okS();
      $("pgo").style.display = "inline-block";
    };
  } else {
    $("pinfo").textContent = "Você joga sozinha(o) neste tabuleiro!";
    $("pgo").style.display = "inline-block";
  }
  show("pick");
}

function startBoard() {
  const B = $("bd");
  B.style.gridTemplateColumns = `repeat(${G.C},1fr)`;
  B.style.gridTemplateRows = `repeat(${G.R},1fr)`;
  B.style.aspectRatio = G.C / G.R;
  $("bw").style.setProperty("--C", G.C);
  $("bw").style.setProperty("--R", G.R);
  $("ov").style.aspectRatio = G.C / G.R;

  // desenha as casas
  B.innerHTML = G.path
    .map(([c, r], i) => {
      const t = T(i, G.path.length);
      const txt = t == "Q" ? "?" : t == "S" ? "⚡" : t == "F" ? "FIM" : "";
      return `<div class="cell ${t}" style="grid-column:${c + 1};grid-row:${r + 1}">${txt}</div>`;
    })
    .join("");

  // desenha as personagens
  $("ov").innerHTML = G.pl
    .map((p, i) => `<div class="tk" id="tk${i}" style="height:${130 / G.R}%"><div class="w"><img src="${p.f}"></div></div>`)
    .join("");

  qi = shuf(Q.map((_, i) => i)); // embaralha as perguntas a cada novo jogo
  $("ov").style.opacity = 1;
  gd = mkDie($("gd"));
  gd.onclick = roll;
  G.phase = "roll";
  info("Jogue o dado!");
  show("game");
  draw();
}

function draw() {
  const w = G.pl[G.turn];
  $("turn").innerHTML = `<img src="${w.f}">Vez de ${w.n}!`;
  $("sc").textContent = G.pl.map(p => p.n + ": " + p.pts + " pts").join("  •  ");
  G.pl.forEach((p, i) => {
    const e = $("tk" + i);
    const [c, r] = G.path[p.pos];
    const off = (i - (G.n - 1) / 2) * 0.3 / G.C;
    e.style.left = ((c + 0.5) / G.C + off) * 100 + "%";
    e.style.top = (r + 0.95) / G.R * 100 + "%";
    e.style.zIndex = r * 5 + i;
    e.classList.toggle("cur", i == G.turn && G.n > 1);
    e.classList.toggle("fl", p.dir == "r");
    e.querySelector("img").src = p.dir == "u" ? p.b : p.dir == "d" ? p.f : p.s;
  });
}

function info(t) {
  $("info").textContent = t;
}

async function roll() {
  if (G.phase != "roll") return;
  G.phase = "rolling";
  G.start = G.pl[G.turn].pos; // guarda a casa de partida (para voltar se errar)
  G.wrong = false;
  const v = Math.random() * 6 + 1 | 0;
  await gd.roll(v);
  G.steps = v;
  G.phase = "move";
  hint();
}

const AR = { ArrowUp: "▲", ArrowDown: "▼", ArrowLeft: "◀", ArrowRight: "▶" };

function need() {
  const p = G.pl[G.turn];
  const a = G.path[p.pos];
  const b = G.path[p.pos + 1];
  return b[0] > a[0] ? "ArrowRight" : b[0] < a[0] ? "ArrowLeft" : b[1] > a[1] ? "ArrowDown" : "ArrowUp";
}

function hint() {
  info(`Tirou ${G.steps}! Passos restantes: ${G.steps} — aperte ${AR[need()]}`);
}

// Move a personagem p para a casa np 
function move(p, np, ms) {
  const a = G.path[p.pos];
  const b = G.path[np];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  p.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "r" : "l") : (dy > 0 ? "d" : "u");
  p.pos = np;
  const e = $("tk" + G.turn);
  e.classList.add("walk");
  draw();
  setTimeout(() => e.classList.remove("walk"), ms);
}

function step(k) {
  if (!G || G.phase != "move") return;
  const p = G.pl[G.turn];
  if (k != need()) {
    info("Siga a trilha: aperte " + AR[need()]);
    return;
  }
  move(p, p.pos + 1, 380);
  G.steps--;
  tone(440, 0, 0.08, "square");
  if (G.steps == 0 || p.pos == G.path.length - 1) {
    G.phase = "q";
    setTimeout(land, 500);
  } else {
    hint();
  }
}

document.addEventListener("keydown", e => {
  if (AR[e.key]) {
    e.preventDefault();
    step(e.key);
  }
});
document.querySelectorAll(".pad button").forEach(b => (b.onclick = () => step(b.dataset.k)));

function land() {
  const p = G.pl[G.turn];
  const t = T(p.pos, G.path.length);
  if (t == "F") return win(p);
  if (t == "S") {
    info("⚡ Atalho! Avança 3 casas.");
    tone(880, 0, 0.15);
    tone(1175, 0.15, 0.2);
    move(p, Math.min(p.pos + 3, G.path.length - 1), 800);
    return setTimeout(() => {
      const u = T(p.pos, G.path.length);
      u == "F" ? win(p) : u == "Q" ? ask() : nextT();
    }, 1000);
  }
  t == "Q" ? ask() : nextT();
}

function nextT() {
  G.turn = (G.turn + 1) % G.n;
  G.phase = "roll";
  info("Jogue o dado!");
  draw();
}

function ask() {
  if (!qi.length) qi = shuf(Q.map((_, i) => i));
  const q = Q[qi.pop()];
  $("who").textContent = G.pl[G.turn].n + " — pergunta!";
  $("qt").textContent = q[0];
  $("qn").style.display = "none";
  // monta as alternativas embaralhadas (a certa é q[1])
  $("qo").innerHTML = shuf(q.slice(1).map((t, i) => ({ t, ok: !i })))
    .map((o, i) => `<button class="opt" data-ok="${o.ok ? 1 : 0}"><b>${"ABCD"[i]}</b><span>${o.t}</span></button>`)
    .join("");
  $("qo").querySelectorAll(".opt").forEach(b => {
    b.onclick = () => {
      const ok = b.dataset.ok == "1";
      $("qo").querySelectorAll(".opt").forEach(x => {
        x.disabled = true;
        if (x.dataset.ok == "1") x.classList.add("ok"); 
      });
      if (ok) {
        G.pl[G.turn].pts += 10; // pontos por acerto
        okS();
      } else {
        b.classList.add("bad");
        badS();
        G.wrong = true;
      }
      $("qn").style.display = "inline-block";
    };
  });
  $("ov").style.opacity = 0; 
  $("qm").classList.add("on");
}

function endQ() {
  $("qm").classList.remove("on");
  $("ov").style.opacity = 1;
  const p = G.pl[G.turn];
  if (G.wrong && p.pos > G.start) {
    G.wrong = false;
    G.phase = "back";
    info("Errou! Volta " + (p.pos - G.start) + " casa(s)...");
    setTimeout(back, 500);
  } else {
    G.wrong = false;
    nextT();
  }
}

function back() {
  const p = G.pl[G.turn];
  if (p.pos > G.start) {
    move(p, p.pos - 1, 320);
    tone(300, 0, 0.08, "square");
    setTimeout(back, 380);
  } else {
    setTimeout(nextT, 300);
  }
}

function win(p) {
  G.phase = "end";
  draw();
  $("wt").textContent = "🏆 " + p.n + " chegou ao FIM!";
  $("wp").textContent = G.pl.map(x => x.n + ": " + x.pts + " pontos").join(" • ");
  okS();
  $("wm").classList.add("on");
}

function buildMenu() {
  $("modes").innerHTML = [1, 2, 3]
    .map(n => `<button class="mode" onclick="go(${n})">
        <div class="sps">${SP.slice(0, n).map(p => `<img src="${p.f}">`).join("")}</div>
        <b>${n} jogador${n > 1 ? "es" : ""}</b>
        <small>${["Treino solo", "Duelo", "Trio"][n - 1]}</small>
      </button>`)
    .join("");
}
buildMenu();
