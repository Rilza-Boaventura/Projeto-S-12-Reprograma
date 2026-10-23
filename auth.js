// Autenticação, área do cliente e painel administrativo (Supabase Auth)
const authMessage = document.getElementById("auth-message");
const signedOut = document.getElementById("auth-signed-out");
const signedIn = document.getElementById("auth-signed-in");
const authForms = ["login-form", "signup-form", "recovery-form", "new-password-form"]
  .map(id => document.getElementById(id));

function setAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("error", isError);
}
function showAuthView(view) {
  const map = { login: "login-form", signup: "signup-form", recovery: "recovery-form", newPassword: "new-password-form" };
  authForms.forEach(form => { form.hidden = form.id !== map[view]; });
  document.querySelectorAll("[data-auth-view]").forEach(button => button.classList.toggle("active", button.dataset.authView === view));
  setAuthMessage("");
}
document.querySelectorAll("[data-auth-view]").forEach(button => button.addEventListener("click", () => showAuthView(button.dataset.authView)));
document.getElementById("show-recovery").addEventListener("click", () => showAuthView("recovery"));

document.getElementById("signup-form").addEventListener("submit", async event => {
  event.preventDefault();
  const nome = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  if (nome.length < 2) return setAuthMessage("Informe seu nome completo.", true);
  if (password.length < 8) return setAuthMessage("A senha precisa ter pelo menos 8 caracteres.", true);
  setAuthMessage("Criando sua conta...");
  const { data, error } = await supabaseClient.auth.signUp({
    email, password, options: { data: { nome }, emailRedirectTo: window.location.origin + window.location.pathname }
  });
  if (error) return setAuthMessage(error.message, true);
  if (data.session) {
    setAuthMessage("Conta criada com sucesso!");
    await refreshAccount(data.session);
  } else {
    showAuthView("login");
    setAuthMessage("Cadastro iniciado! Verifique seu e-mail para confirmar a conta e depois faça login.");
  }
});
document.getElementById("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  setAuthMessage("Entrando...");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return setAuthMessage("Não foi possível entrar. Confira o e-mail e a senha e tente novamente.", true);
  await refreshAccount(data.session);
  setAuthMessage("Login realizado com sucesso!");
});
document.getElementById("recovery-form").addEventListener("submit", async event => {
  event.preventDefault();
  setAuthMessage("Enviando instruções...");
  const email = document.getElementById("recovery-email").value.trim();
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) return setAuthMessage(error.message, true);
  setAuthMessage("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
});
document.getElementById("new-password-form").addEventListener("submit", async event => {
  event.preventDefault();
  const password = document.getElementById("new-password").value;
  if (password.length < 8) return setAuthMessage("A senha precisa ter pelo menos 8 caracteres.", true);
  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) return setAuthMessage(error.message, true);
  await supabaseClient.auth.signOut();
  showAuthView("login");
  setAuthMessage("Senha atualizada. Entre usando sua nova senha.");
});
document.getElementById("logout-button").addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) return setAuthMessage("Não foi possível sair da conta.", true);
  currentUser = null; currentSession = null; currentIsAdmin = false;
  signedIn.hidden = true; signedOut.hidden = false;
  document.getElementById("admin-panel").hidden = true;
  showAuthView("login");
  setAuthMessage("Você saiu da sua conta.");
});
document.getElementById("refresh-requests").addEventListener("click", loadMyRequests);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
}
function statusLabel(value) {
  return ({ novo: "Novo", em_atendimento: "Em atendimento", concluido: "Concluído", cancelado: "Cancelado" })[value] || value;
}
async function refreshAccount(session) {
  currentSession = session || null;
  currentUser = session?.user || null;
  currentIsAdmin = false;
  if (!currentUser) {
    signedIn.hidden = true; signedOut.hidden = false;
    return;
  }
  signedOut.hidden = true; signedIn.hidden = false;
  const profileResult = await supabaseClient.from("profiles").select("nome").eq("id", currentUser.id).maybeSingle();
  const nome = profileResult.data?.nome || currentUser.user_metadata?.nome || currentUser.email;
  document.getElementById("welcome-user").textContent = "Olá, " + nome + "! Você está conectado.";
  const adminResult = await supabaseClient.from("admin_users").select("user_id").eq("user_id", currentUser.id).maybeSingle();
  currentIsAdmin = Boolean(adminResult.data && !adminResult.error);
  document.getElementById("admin-panel").hidden = !currentIsAdmin;
  await loadMyRequests();
  if (currentIsAdmin) await loadAdminRequests();
}
async function loadMyRequests() {
  const tbody = document.getElementById("my-requests-body");
  if (!currentUser) return;
  tbody.innerHTML = '<tr><td colspan="6">Carregando solicitações...</td></tr>';
  const { data, error } = await supabaseClient.from("solicitacoes_orcamento")
    .select("id,created_at,viajantes,preco_estimado,status,locais(nome)")
    .eq("user_id", currentUser.id).order("created_at", { ascending: false });
  if (error) {
    tbody.innerHTML = '<tr><td colspan="6">Não foi possível carregar suas solicitações. Confira a configuração do banco de dados.</td></tr>';
    return;
  }
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="6">Você ainda não tem solicitações vinculadas à sua conta. Faça login antes de enviar um novo orçamento.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(item => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(new Date(item.created_at).toLocaleDateString("pt-BR"))}</td><td>${escapeHtml(item.locais?.nome || "Destino")}</td><td>${escapeHtml(item.viajantes)}</td><td>${escapeHtml(fmt(item.preco_estimado))}</td><td>${escapeHtml(statusLabel(item.status))}</td></tr>`).join("");
}
async function loadAdminRequests() {
  if (!currentIsAdmin) return;
  const tbody = document.getElementById("admin-requests-body");
  tbody.innerHTML = '<tr><td colspan="8">Carregando solicitações...</td></tr>';
  const { data, error } = await supabaseClient.from("solicitacoes_orcamento")
    .select("id,created_at,email,viajantes,preco_estimado,status,locais(nome)")
    .order("created_at", { ascending: false });
  if (error) {
    tbody.innerHTML = '<tr><td colspan="8">Não foi possível carregar o painel. Confira as políticas de acesso do administrador.</td></tr>';
    return;
  }
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="8">Nenhuma solicitação encontrada.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(item => `<tr>
    <td>${escapeHtml(item.id)}</td><td>${escapeHtml(new Date(item.created_at).toLocaleDateString("pt-BR"))}</td>
    <td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.locais?.nome || "Destino")}</td>
    <td>${escapeHtml(item.viajantes)}</td><td>${escapeHtml(fmt(item.preco_estimado))}</td>
    <td><select class="admin-status" data-request-id="${escapeHtml(item.id)}" aria-label="Status da solicitação ${escapeHtml(item.id)}">
      ${["novo","em_atendimento","concluido","cancelado"].map(s => `<option value="${s}" ${s === item.status ? "selected" : ""}>${statusLabel(s)}</option>`).join("")}
    </select></td><td><button type="button" class="pick save-status" data-request-id="${escapeHtml(item.id)}">Salvar</button></td>
  </tr>`).join("");
  tbody.querySelectorAll(".save-status").forEach(button => button.addEventListener("click", async () => {
    const id = button.dataset.requestId;
    const select = tbody.querySelector(`.admin-status[data-request-id="${CSS.escape(id)}"]`);
    const { error: updateError } = await supabaseClient.from("solicitacoes_orcamento").update({ status: select.value }).eq("id", id);
    if (updateError) return setAuthMessage("Não foi possível atualizar o status. Confira as permissões do administrador.", true);
    setAuthMessage("Status da solicitação #" + id + " atualizado.");
    await loadAdminRequests(); await loadMyRequests();
  }));
}
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    signedOut.hidden = false; showAuthView("newPassword");
    setAuthMessage("Defina uma nova senha para sua conta.");
    return;
  }
  queueMicrotask(() => refreshAccount(session));
});
