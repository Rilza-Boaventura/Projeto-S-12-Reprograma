// Conexão com o Supabase (a chave "publishable" é pública; quem protege os dados é o RLS)
const SUPABASE_URL = "https://sunasnvfjsmyuwfqpttr.supabase.co";
const SUPABASE_KEY = "sb_publishable_7Y2Nzbf234Q4VRsIwi4cBA_MPdBPTBQ";

async function api(caminho) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!r.ok) throw new Error("Erro " + r.status);
  return r.json();
}

// Aparência de cada card (cores e desenho), pelo nome do local
const VISUAL = {
  "Fernando de Noronha": { g: ["#0a7ea4", "#7fd6e0"], s: "onda" },
  "Lençóis Maranhenses": { g: ["#e8a23d", "#7fc8d8"], s: "duna" },
  "Chapada Diamantina": { g: ["#2f7d5b", "#c9a45c"], s: "montanha" },
  "Rio de Janeiro": { g: ["#2a7fc1", "#f5b25a"], s: "morro" },
  "Gramado e Canela": { g: ["#5a6fa8", "#c9b6e4"], s: "montanha" },
  "Foz do Iguaçu": { g: ["#1f8a5b", "#9fdcc0"], s: "mata" },
  "Amazônia (Manaus)": { g: ["#14532d", "#6bbf8a"], s: "mata" },
  "Bonito": { g: ["#0e9aa7", "#a7e3d0"], s: "onda" }
};
const PADRAO = { g: ["#0a5c6b", "#7fd6e0"], s: "onda" };

const fmt = v => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dataBR = iso => iso.split("-").reverse().join("/");

const grid = document.getElementById("grid"), dest = document.getElementById("dest"),
      dataSel = document.getElementById("data"), pax = document.getElementById("pax"),
      total = document.getElementById("total"), status = document.getElementById("status");

let pacotes = [], datas = [], filtro = "todas";

function desenharCards() {
  const lista = pacotes.filter(p => filtro === "todas" || p.regiao === filtro);
  grid.innerHTML = lista.map(p => {
    const v = VISUAL[p.nome] || PADRAO;
    const proxima = datas.find(d => d.local_id === p.local_id && d.vagas > 0);
    const preco = p.desconto_percentual > 0
      ? `<span class="price"><s>${fmt(p.preco_base)}</s><b>${fmt(p.preco_final)}<span class="tag">-${Number(p.desconto_percentual)}%</span></b></span>`
      : `<span class="price"><b>${fmt(p.preco_base)}</b></span>`;
    return `<article class="card"><div class="scene" style="background:linear-gradient(180deg,${v.g[0]},${v.g[1]})"><svg aria-hidden="true"><use href="#${v.s}"/></svg></div>
<div class="info"><h3>${p.nome}</h3><small>${p.estado} · ${p.regiao} · ${p.noites} noites</small>
<p style="margin:.4rem 0 0">${p.descricao || ""}</p>
<p class="next">${proxima ? "Próxima saída: " + dataBR(proxima.data_saida) : "Sem datas disponíveis"}</p>
<div class="row">${preco}<button class="pick" data-id="${p.local_id}">Orçar</button></div></div></article>`;
  }).join("");
}

function desenharDatas() {
  const id = Number(dest.value);
  const lista = datas.filter(d => d.local_id === id);
  dataSel.innerHTML = lista.length
    ? lista.map(d => `<option value="${d.id}" ${d.vagas === 0 ? "disabled" : ""}>${dataBR(d.data_saida)} a ${dataBR(d.data_volta)} · ${d.vagas === 0 ? "esgotado" : d.vagas + " vagas"}</option>`).join("")
    : `<option value="">Sem datas disponíveis</option>`;
  const livre = lista.find(d => d.vagas > 0);
  if (livre) dataSel.value = livre.id;
}

function calcular() {
  const p = pacotes.find(x => x.local_id === Number(dest.value));
  if (!p) return;
  const d = datas.find(x => x.id === Number(dataSel.value));
  const max = d ? d.vagas : 10;
  pax.max = max;
  const n = Math.min(max, Math.max(1, parseInt(pax.value) || 1));
  const t = p.preco_final * n;
  total.innerHTML = `${fmt(t)}<small>ou 10x de ${fmt(t / 10)} sem juros, para ${n} ${n > 1 ? "viajantes" : "viajante"}${p.desconto_percentual > 0 ? ` (já com ${Number(p.desconto_percentual)}% de desconto)` : ""}</small>`;
}

async function iniciar() {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const [vw, locais, dts] = await Promise.all([
      api("vw_pacotes?select=*&order=local_id"),
      api("locais?select=id,descricao"),
      api(`datas_disponiveis?select=id,local_id,data_saida,data_volta,vagas&data_saida=gte.${hoje}&order=data_saida`)
    ]);
    const desc = Object.fromEntries(locais.map(l => [l.id, l.descricao]));
    pacotes = vw.map(p => ({ ...p, descricao: desc[p.local_id] }));
    datas = dts;
    status.textContent = "";
    dest.innerHTML = pacotes.map(p => `<option value="${p.local_id}">${p.nome}</option>`).join("");
    desenharCards(); desenharDatas(); calcular();
  } catch (e) {
    status.textContent = "Não foi possível carregar os destinos agora. Tente novamente em instantes.";
  }
}

dest.onchange = () => { desenharDatas(); calcular(); };
dataSel.onchange = pax.oninput = calcular;

document.querySelector(".filters").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  document.querySelectorAll(".filters button").forEach(x => x.setAttribute("aria-pressed", x === b));
  filtro = b.dataset.f; desenharCards();
});
grid.addEventListener("click", e => {
  const b = e.target.closest(".pick"); if (!b) return;
  dest.value = b.dataset.id; desenharDatas(); calcular();
  document.getElementById("orcamento").scrollIntoView();
});
document.getElementById("form").onsubmit = e => {
  e.preventDefault();
  const v = document.getElementById("email").value.trim(), m = document.getElementById("msg");
  const p = pacotes.find(x => x.local_id === Number(dest.value));
  m.textContent = /^\S+@\S+\.\S+$/.test(v)
    ? `Pedido enviado para ${p.nome}. Respondemos em até 24 horas.`
    : "Digite um e-mail válido, como nome@email.com.";
};

iniciar();
