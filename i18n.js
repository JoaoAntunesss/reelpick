// Interface language: Portuguese (Portugal) or English.
// The UI is written in English; in Portuguese, every text node and label
// shown on the page is translated as it appears (exact strings + patterns).

const KEY = "rp_lang";
function pick() {
  try { const v = localStorage.getItem(KEY); if (v === "pt" || v === "en") return v; } catch (e) { /* private mode */ }
  return /^pt\b/i.test(navigator.language || "") ? "pt" : "en";
}
export const lang = pick();
export const isPT = lang === "pt";
export const tmdbLang = isPT ? "pt-PT" : "en-US";
export function setLang(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } location.reload(); }

const GENRES = {
  Action: "Ação", Adventure: "Aventura", Animation: "Animação", Comedy: "Comédia", Crime: "Crime", Documentary: "Documentário",
  Drama: "Drama", Family: "Família", Fantasy: "Fantasia", History: "História", Horror: "Terror", Music: "Música", Mystery: "Mistério",
  Romance: "Romance", "Science Fiction": "Ficção científica", Thriller: "Thriller", War: "Guerra", Western: "Western",
};

const T = {
  ...GENRES, Kids: "Infantil",
  // header & filters
  "ReelPick — spin for something to watch": "ReelPick — roda e descobre o que ver",
  "Can't decide what to watch? Set your filters and pull the lever.": "Não sabes o que ver? Escolhe os filtros e puxa a alavanca.",
  "Sign in with Google": "Entrar com Google", "People": "Pessoas", "My profile": "O meu perfil", "Sign out": "Sair",
  "How to get your free key": "Como obter a tua chave grátis",
  "Filters": "Filtros", "What": "O quê", "Type": "Tipo", "Movies": "Filmes", "Series": "Séries", "Both": "Ambos",
  "Genres": "Géneros", "(none = any)": "(nenhum = qualquer)", "Must match all selected": "Tem de ter todos os selecionados",
  "Your platforms": "As tuas plataformas", "(none = anywhere)": "(nenhuma = qualquer uma)", "Country": "País", "Style": "Estilo",
  "Minimum rating:": "Classificação mínima:", "any": "qualquer",
  "Slot machine": "Slot machine", "Pick of the day": "Sugestão do dia", "PICK OF THE DAY": "SUGESTÃO DO DIA", "SPIN": "RODAR",
  "Watch trailer": "Ver trailer", "I've watched it — rate": "Já vi — avaliar", "Seen it — spin again": "Já vi — rodar outra vez",
  "Friends' feed": "Feed dos amigos", "Refresh": "Atualizar", "Your friends": "Os teus amigos",
  // styles & countries
  "Anything": "Qualquer coisa", "Crowd pleasers": "Agradam a todos", "Hidden gems": "Pérolas escondidas",
  "Critically acclaimed": "Aclamados pela crítica", "Classics (before 2000)": "Clássicos (antes de 2000)",
  "Recent (last 2 years)": "Recentes (últimos 2 anos)", "Short & sweet (< 100 min)": "Curtos (< 100 min)",
  "Portugal": "Portugal", "Brazil": "Brasil", "Spain": "Espanha", "France": "França", "United Kingdom": "Reino Unido",
  "United States": "Estados Unidos", "Germany": "Alemanha", "Italy": "Itália",
  // how-to
  "How to get your free TMDB key": "Como obter a tua chave TMDB grátis",
  "ReelPick gets its movies, series and streaming info from TMDB, a free database. Each person uses their own free key, so nothing is paid and nothing is shared. It takes about two minutes, once.":
    "O ReelPick vai buscar os filmes, as séries e onde dão ao TMDB, uma base de dados gratuita. Cada pessoa usa a sua própria chave grátis, por isso não se paga nada e nada é partilhado. Demora uns dois minutos, uma só vez.",
  "Create an account.": "Cria uma conta.", "Go to": "Vai a", "and confirm your email.": "e confirma o teu email.",
  "Ask for an API key.": "Pede uma chave de API.", "Open": "Abre",
  ", choose to create a key for personal (non-commercial) use, accept the terms and fill in the short form (any app name, e.g. “ReelPick”, and a one-line description).":
    ", escolhe criar uma chave para uso pessoal (não comercial), aceita os termos e preenche o formulário curto (qualquer nome de app, p. ex. “ReelPick”, e uma descrição de uma linha).",
  "Copy the token.": "Copia o token.", "On that same page, copy the long": "Nessa mesma página, copia o",
  "API Read Access Token": "API Read Access Token (o longo)", ". (The short “API Key” also works.)": ". (A “API Key” curta também serve.)",
  "Paste it here.": "Cola-o aqui.", "Click": "Carrega em", "TMDB key…": "Chave TMDB…",
  "at the bottom of this page, paste it and press Save. The demo banner disappears and the platform logos for your country show up.":
    "no fundo desta página, cola-a e carrega em Guardar. O aviso de demonstração desaparece e aparecem os logótipos das plataformas do teu país.",
  "Your key stays in this browser only and is sent only to TMDB. Never put it in a public file or share a screenshot of it.":
    "A tua chave fica só neste navegador e só é enviada ao TMDB. Nunca a ponhas num ficheiro público nem partilhes uma captura de ecrã dela.",
  "How to use it": "Como usar", "Pick": "Escolhe", "Movies, Series or Both": "Filmes, Séries ou Ambos", ".": ".",
  "Tick the": "Marca os", "genres": "géneros",
  "you fancy (none = any). “Must match all” keeps only titles with every selected genre.":
    "que te apetecem (nenhum = qualquer). “Tem de ter todos” deixa só títulos com todos os géneros escolhidos.",
  "Choose your": "Escolhe o teu", "country": "país", ", then tap the": " e depois toca nas",
  "streaming platforms you have": "plataformas de streaming que tens",
  ". Only titles included in those subscriptions are picked.": ". Só saem títulos incluídos nessas subscrições.",
  "Choose a": "Escolhe um", "style": "estilo",
  "(hidden gems, classics, recent…) and a minimum rating if you want.": "(pérolas escondidas, clássicos, recentes…) e uma classificação mínima, se quiseres.",
  "Press": "Carrega em", "or pull the": "ou puxa a", "lever": "alavanca", ". The reel slows down on a random title.": ". O rolo abranda até parar num título ao acaso.",
  "Not into it?": "Não te convence?",
  "remembers it and never shows it again (manage it in “My seen list” in the footer).":
    "guarda-o e nunca mais o mostra (gere isso em “A minha lista de vistos” no rodapé).",
  "No key yet? The page works in demo mode with a small built-in sample, without platform filters.":
    "Ainda sem chave? A página funciona em modo de demonstração com uma pequena amostra, sem filtros de plataforma.",
  "This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data provided by JustWatch via TMDB.":
    "Este produto usa a API do TMDB, mas não é aprovado nem certificado pelo TMDB. Dados de disponibilidade em streaming fornecidos pela JustWatch através do TMDB.",
  // seen list
  "My seen list": "A minha lista de vistos",
  "Titles you marked as seen are never picked again. The list lives in this browser only, so use Export to keep a backup or move it to another device.":
    "Os títulos que marcaste como vistos nunca mais saem. A lista fica só neste navegador; usa Exportar para guardar uma cópia ou passá-la para outro aparelho.",
  "Your rating": "A tua classificação", "Your review": "A tua crítica",
  "Your review (optional, up to 600 characters)": "A tua crítica (opcional, até 600 caracteres)",
  "Pin it on your profile: why should people watch it? (optional)": "Destaca no teu perfil: porque é que deviam ver? (opcional)",
  "Pin as my recommendation": "Destacar como recomendação", "Save": "Guardar", "Close editor": "Fechar editor",
  "Export": "Exportar", "Import": "Importar", "Clear all": "Apagar tudo", "Close": "Fechar", "Click again to confirm": "Carrega outra vez para confirmar",
  "Remove from seen": "Tirar dos vistos", "Saved.": "Guardado.",
  "Nothing here yet. Press “Seen it — spin again” on a result to add it.": "Ainda não há nada. Carrega em “Já vi — rodar outra vez” num resultado para o juntar.",
  "That file is not a valid ReelPick list.": "Esse ficheiro não é uma lista válida do ReelPick.",
  // tastes
  "What do you like?": "Do que é que gostas?",
  "Pick up to 8 genres. ReelPick uses them for your pick of the day, and your friends see them on your profile.":
    "Escolhe até 8 géneros. O ReelPick usa-os na tua sugestão do dia e os teus amigos veem-nos no teu perfil.",
  "Movies or series": "Filmes ou séries", "Save my tastes": "Guardar os meus gostos", "Up to 8 genres.": "No máximo 8 géneros.",
  "Tell us what you like and get a new pick every day, chosen for you.": "Diz-nos do que gostas e recebe todos os dias uma sugestão escolhida para ti.",
  "Choose my tastes": "Escolher os meus gostos", "Choosing today's pick…": "A escolher a sugestão de hoje…",
  "Could not load today's pick.": "Não foi possível carregar a sugestão de hoje.",
  "No new suggestion for these tastes right now. Try other genres or clear your seen list.":
    "Agora não há sugestões novas para estes gostos. Experimenta outros géneros ou limpa a lista de vistos.",
  "Change my tastes": "Mudar os meus gostos", "Seen it": "Já vi", "Another pick": "Outra sugestão", "My tastes": "Os meus gostos",
  // result & machine
  "Movie": "Filme", "No description available.": "Sem descrição disponível.", "Untitled": "Sem título", "Unknown title": "Título desconhecido",
  "Something went wrong.": "Algo correu mal.",
  "You've seen everything this filter finds. Clear the “seen” list or relax the filters.": "Já viste tudo o que este filtro encontra. Limpa a lista de “vistos” ou alarga os filtros.",
  "Nothing matches these filters. Try fewer genres or platforms.": "Nada corresponde a estes filtros. Experimenta menos géneros ou plataformas.",
  "Platform filters need a TMDB key.": "Os filtros de plataforma precisam de uma chave TMDB.",
  "Demo mode: a small built-in sample. Add a free TMDB key for every movie and series, plus platform filters.":
    "Modo de demonstração: uma pequena amostra. Junta uma chave TMDB grátis para teres todos os filmes e séries, e filtros de plataforma.",
  " How to get it": " Como obter", "🔑 Add your free TMDB key": "🔑 Junta a tua chave TMDB grátis", "🔑 TMDB key connected ✓": "🔑 Chave TMDB ligada ✓",
  "Change or remove your key": "Mudar ou remover a tua chave", "Unlock every movie and series plus platform filters": "Desbloqueia todos os filmes e séries e os filtros de plataforma",
  "TMDB rejected the key. Check it in “TMDB key…”.": "O TMDB recusou a chave. Verifica-a em “Chave TMDB…”.",
  // profile
  "Upload photo": "Carregar foto", "Remove": "Remover",
  "Resized in your browser to a small square and stored in your profile (no paid storage).": "Reduzida no teu navegador para um pequeno quadrado e guardada no teu perfil (sem armazenamento pago).",
  "Display name": "Nome a mostrar", "Nickname (people find you with it)": "Alcunha (é com ela que te encontram)", "e.g. joao_99": "p. ex. joao_99",
  "Save nickname": "Guardar alcunha", "3 to 20 letters, numbers or _ . Nicknames are unique.": "3 a 20 letras, números ou _ . As alcunhas são únicas.",
  "My tastes:": "Os meus gostos:", "Change": "Mudar", "About me": "Sobre mim",
  "Tell people about your taste in movies and series (up to 300 characters)": "Conta o teu gosto em filmes e séries (até 300 caracteres)",
  "Who can see my profile, list, ratings and reviews": "Quem pode ver o meu perfil, lista, classificações e críticas",
  "Only me": "Só eu", "My friends (people I accepted)": "Os meus amigos (pessoas que aceitei)",
  "Any signed-in person who knows my nickname": "Qualquer pessoa com sessão iniciada que saiba a minha alcunha",
  "Share link": "Link para partilhar", "Copy": "Copiar", "Pinned recommendation": "Recomendação em destaque", "What is stored:": "O que fica guardado:",
  "display name, nickname, photo, about me, watched list, ratings and reviews, in Google Firebase. Your email is never shown to anyone. Strangers only see your nickname. You can delete everything below.":
    "nome, alcunha, foto, sobre mim, lista de vistos, classificações e críticas, no Google Firebase. O teu email nunca é mostrado a ninguém. Desconhecidos só veem a tua alcunha. Podes apagar tudo aqui em baixo.",
  "Delete my account and data": "Apagar a minha conta e dados",
  "Find people": "Encontrar pessoas", "Requests": "Pedidos", "Friends": "Amigos", "Search by nickname": "Pesquisar por alcunha", "Search": "Pesquisar",
  "Reviews": "Críticas", "Compared with me": "Comparado comigo", "Add friend": "Adicionar amigo",
  // key dialog
  "Connect to TMDB (free)": "Ligar ao TMDB (grátis)", "Create a free account at themoviedb.org.": "Cria uma conta grátis em themoviedb.org.",
  "Open Settings › API and request a key for personal use.": "Abre Settings › API e pede uma chave para uso pessoal.",
  "Step-by-step guide": "Guia passo a passo", "Paste the": "Cola o", "(or the v3 API key) below.": "(ou a chave v3) aqui em baixo.",
  "Key": "Chave", "paste your key or token": "cola a tua chave ou token",
  "It stays in this browser only (localStorage) and is sent only to api.themoviedb.org.": "Fica só neste navegador (localStorage) e só é enviada para api.themoviedb.org.",
  "Use demo": "Usar demonstração",
  // social
  "Accept": "Aceitar", "Accept friend request": "Aceitar pedido de amizade", "Decline": "Recusar", "Cancel": "Cancelar",
  "Add friends in People to see what they are watching and what they thought of it.": "Adiciona amigos em Pessoas para veres o que andam a ver e o que acharam.",
  "Choose an image file (up to 15 MB).": "Escolhe um ficheiro de imagem (até 15 MB).",
  "Could not open the profile.": "Não foi possível abrir o perfil.", "Friend": "Amigo", "Link copied.": "Link copiado.",
  "Loading your friends' feed…": "A carregar o feed dos teus amigos…", "Me": "Eu", "You": "Tu",
  "Nickname: 3 to 20 letters, numbers or _ .": "Alcunha: 3 a 20 letras, números ou _ .",
  "No friends yet. Search a nickname in “Find people”.": "Ainda sem amigos. Pesquisa uma alcunha em “Encontrar pessoas”.",
  "No pending requests.": "Sem pedidos pendentes.", "No ratings or reviews yet.": "Ainda sem classificações nem críticas.",
  "No review, just watched.": "Sem crítica, só viu.", "Nothing logged yet": "Ainda não registou nada",
  "Nothing pinned yet. Open My seen list, pick a title and use “Pin as my recommendation”.": "Ainda nada em destaque. Abre A minha lista de vistos, escolhe um título e usa “Destacar como recomendação”.",
  "Press Ctrl+C to copy.": "Carrega em Ctrl+C para copiar.", "Private profile": "Perfil privado", "Profile not shown": "Perfil não visível",
  "Profile saved.": "Perfil guardado.", "Recommends": "Recomenda", "Remove friend": "Remover amigo", "Remove pin": "Tirar destaque",
  "Request sent · Cancel": "Pedido enviado · Cancelar", "Searching…": "A pesquisar…", "Set a nickname to get a link": "Define uma alcunha para teres um link",
  "That image is too detailed. Try another one.": "Essa imagem tem demasiado detalhe. Experimenta outra.",
  "That nickname is taken. Try another.": "Essa alcunha já está ocupada. Experimenta outra.", "This person": "Esta pessoa",
  "This person made their profile private.": "Esta pessoa tornou o perfil privado.",
  "This profile is not visible to you. Send a friend request to see more, if they allow friends to view it.": "Não podes ver este perfil. Envia um pedido de amizade para veres mais, se a pessoa deixar os amigos ver.",
  "Type a nickname (or the first letters) and press Search.": "Escreve uma alcunha (ou as primeiras letras) e carrega em Pesquisar.",
  "Type at least 2 letters or numbers.": "Escreve pelo menos 2 letras ou números.", "View": "Ver", "You both saw": "Ambos viram",
  "Your account and cloud data were deleted.": "A tua conta e os dados na nuvem foram apagados.",
  "Your friends have not logged anything yet. When they mark a title as seen, it shows up here.": "Os teus amigos ainda não registaram nada. Quando marcarem um título como visto, aparece aqui.",
  "not rated": "sem classificação", "not set": "não definido", "request sent": "pedido enviado", "wants to be your friend": "quer ser teu amigo",
  " reviewed": " criticou", " watched": " viu", "A friend": "Um amigo",
  "Choose": "Escolher", "Feed": "Feed", "Top": "Top", "Sections": "Secções", "Add": "Adicionar",
  "Can't decide what to watch?": "Não sabes o que ver?", "Set your filters and pull the lever.": "Escolhe os filtros e puxa a alavanca.",
  "🎰 Can't decide what to watch?": "🎰 Não sabes o que ver?", "🏆 Top critics": "🏆 Top críticos",
  "Top critics": "Top críticos", "Who wrote the most reviews.": "Quem escreveu mais críticas.",
  "Your friends' movies, in one feed": "Os filmes dos teus amigos, num só feed",
  "Sign in to see what your friends are watching, how they rated it and what they thought. Share yours too.": "Entra para veres o que os teus amigos andam a ver, que nota deram e o que acharam. E partilha os teus.",
  "Or spin for something to watch →": "Ou roda a slot machine e descobre o que ver →",
  "Leaderboard": "Classificação", "Everyone": "Todos",
  "Ranked by reviews written. “Everyone” only includes public profiles.": "Ordenado pelo número de críticas. “Todos” inclui só perfis públicos.",
  "Nobody here yet.": "Ainda não há ninguém.", "Counting reviews…": "A contar críticas…",
  "Sign in to see who writes the most reviews.": "Entra para veres quem escreve mais críticas.", "review": "crítica", "reviews": "críticas",
  "Messages": "Mensagens", "Message": "Mensagem", "🔔 Turn on alerts": "🔔 Ativar avisos", "Back": "Voltar",
  "Write a message…": "Escreve uma mensagem…", "Send": "Enviar", "Send to…": "Enviar a…", "💬 Send to a friend": "💬 Enviar a um amigo",
  "💬 Message": "💬 Mensagem", "💬 Reply": "💬 Responder", "📲 Install app": "📲 Instalar app",
  "Choose a friend to talk about movies and series.": "Escolhe um amigo para falarem de filmes e séries.",
  "Sign in to talk with your friends about movies and series.": "Entra para falares com os teus amigos sobre filmes e séries.",
  "Add friends to start a conversation.": "Adiciona amigos para começares uma conversa.", "Say hello 👋": "Diz olá 👋",
  "No messages yet. Recommend something!": "Ainda sem mensagens. Recomenda alguma coisa!", "Loading…": "A carregar…",
  "Sign in with Google to send it to a friend.": "Entra com Google para enviares a um amigo.", "Add friends first, in People.": "Primeiro adiciona amigos, em Pessoas.",
  "On iPhone: tap Share, then “Add to Home Screen”.": "No iPhone: toca em Partilhar e depois em “Adicionar ao ecrã principal”.",
  "People you may know": "Pessoas que talvez conheças", "Hide": "Esconder", "🚫 Block": "🚫 Bloquear", "Blocked people": "Pessoas bloqueadas",
  "You haven't blocked anyone.": "Não bloqueaste ninguém.", "Unblock": "Desbloquear",
  "Blocked. They can no longer see your profile, posts or message you.": "Bloqueado. Essa pessoa já não vê o teu perfil nem os teus posts e não te pode enviar mensagens.",
  "You:": "Tu:", "You": "Tu", "shared": "partilhou", "shared it": "partilhaste", " wrote a review": " escreveste uma crítica", " watched it": " viste", "Like": "Gosto", "Comments": "Comentários", "Share on my feed": "Partilhar no meu feed",
  "Shared": "Partilhado", "Share": "Partilhar", "Liked by": "Gostam:", "Shared on your feed.": "Partilhado no teu feed.",
  "This post can't be shared (private profile).": "Este post não pode ser partilhado (perfil privado).",
  "Write a comment…": "Escreve um comentário…", "Post": "Publicar", "Delete comment": "Apagar comentário", "All": "Todas", "All platforms": "Todas as plataformas",
  "just now": "agora mesmo", "yesterday": "ontem", "PT": "PT", "English": "English", "Português": "Português",
};

const ERR = (en, pt) => [new RegExp("^" + en + " \\((.+)\\)(\\.?)(.*)$"), (m) => pt + " (" + m[1] + ")" + m[2] + (m[3] ? tr(m[3].trim()).replace(/^/, " ") : "")];
const P = [
  [/^My seen list \((\d+)\)$/, (m) => "A minha lista de vistos (" + m[1] + ")"],
  [/^Sound: (on|off)$/, (m) => "Som: " + (m[1] === "on" ? "ligado" : "desligado")],
  [/^Imported (\d+) titles\.$/, (m) => "Importados " + m[1] + " títulos."],
  [/^Rate or review (.+)$/, (m) => "Avaliar ou criticar " + m[1]],
  [/^Remove (.+) from seen list$/, (m) => "Tirar " + m[1] + " da lista de vistos"],
  [/^(\d+) stars?$/, (m) => m[1] + (m[1] === "1" ? " estrela" : " estrelas")],
  [/^(\d+) of 8 selected$/, (m) => m[1] + " de 8 escolhidos"],
  [/^(\d+) seasons?$/, (m) => m[1] + (m[1] === "1" ? " temporada" : " temporadas")],
  [/^included in (.+) \(via JustWatch\)$/, (m) => "incluído em " + tr(m[1]) + " (via JustWatch)"],
  [/^Not on a subscription platform in (.+) right now\.$/, (m) => "Não está agora em nenhuma plataforma de subscrição em " + tr(m[1]) + "."],
  [/^Because you like (.+)$/, (m) => "Porque gostas de " + m[1].split(", ").map(tr).join(", ")],
  [/^TMDB error (\d+)\. Try again\.$/, (m) => "Erro do TMDB " + m[1] + ". Tenta outra vez."],
  [/^(\d+) pending friend request\(s\)$/, (m) => m[1] + (m[1] === "1" ? " pedido de amizade pendente" : " pedidos de amizade pendentes")],
  ERR("Could not talk to your account", "Não foi possível falar com a tua conta"),
  ERR("Signed in, but the cloud could not be read", "Sessão iniciada, mas não foi possível ler a nuvem"),
  ERR("Could not save the nickname", "Não foi possível guardar a alcunha"),
  ERR("Search failed", "A pesquisa falhou"),
  ERR("Sign-in failed", "O início de sessão falhou"),
  ERR("Could not delete", "Não foi possível apagar"),
  ERR("Could not load the feed", "Não foi possível carregar o feed"),
  [/^Check the Firestore rules\.$/, () => "Verifica as regras do Firestore."],
  [/^Try signing in again\.$/, () => "Tenta iniciar sessão outra vez."],
  [/^Nobody uses the nickname @(.+)\.$/, (m) => "Ninguém usa a alcunha @" + m[1] + "."],
  [/^Sign in with Google to see @(.+)'s profile\.$/, (m) => "Entra com Google para veres o perfil de @" + m[1] + "."],
  [/^Nickname saved: @(.+)$/, (m) => "Alcunha guardada: @" + m[1]],
  [/^Requests \((\d+)\)$/, (m) => "Pedidos (" + m[1] + ")"],
  [/^Friends \((\d+)\)$/, (m) => "Amigos (" + m[1] + ")"],
  [/^Nobody found with a nickname starting with “(.+)”\.$/, (m) => "Ninguém encontrado com uma alcunha a começar por “" + m[1] + "”."],
  [/^(.+) · series$/, (m) => m[1] + " · série"],
  [/^Also seen \((\d+)\)$/, (m) => "Também viu (" + m[1] + ")"],
  [/^You both saw (\d+) titles?\.(.*)$/, (m) => "Ambos viram " + m[1] + (m[1] === "1" ? " título." : " títulos.") +
    (/Rate some/.test(m[2]) ? " Avaliem alguns em comum para verem a compatibilidade de gostos." :
      m[2].replace(/ Taste match: (\d+)% \(within 1 star, on (\d+) rated in common\)\./, (_, a, b) => " Compatibilidade de gostos: " + a + "% (diferença até 1 estrela, em " + b + " avaliados em comum).").replace(/^ Taste match:/, " Compatibilidade de gostos:"))],
  [/^(.+) saw, you haven't$/, (m) => m[1] + " viu, tu ainda não"],
  [/^@(\S+) · (\d+) titles seen$/, (m) => "@" + m[1] + " · " + m[2] + " títulos vistos"],
  [/^Likes: (.+?)( \((series|movies)\))?$/, (m) => "Gosta de: " + m[1].split(" · ").map(tr).join(" · ") + (m[3] ? " (" + (m[3] === "series" ? "séries" : "filmes") + ")" : "")],
  [/^Open (.+)'s profile$/, (m) => "Abrir o perfil de " + m[1]],
  [/^(\d+) recent titles?$/, (m) => m[1] + (m[1] === "1" ? " título recente" : " títulos recentes")],
  [/^Pinned on your profile: (.+)$/, (m) => "Destacado no teu perfil: " + m[1]],
  ERR("Could not save the like", "Não foi possível guardar o gosto"),
  ERR("Could not block", "Não foi possível bloquear"),
  ERR("Could not share", "Não foi possível partilhar"),
  ERR("Could not load comments", "Não foi possível carregar os comentários"),
  ERR("Could not post the comment", "Não foi possível publicar o comentário"),
  ERR("Could not send", "Não foi possível enviar"),
  ERR("Could not load messages", "Não foi possível carregar as mensagens"),
  [/^(\d+) seen$/, (m) => m[1] + " vistos"],
  [/^(.+) \(you\)$/, (m) => m[1] + " (tu)"],
  ERR("Could not load the leaderboard", "Não foi possível carregar a classificação"),
  [/^(\d+) min ago$/, (m) => "há " + m[1] + " min"],
  [/^(\d+) h ago$/, (m) => "há " + m[1] + " h"],
  [/^(\d+) days ago$/, (m) => "há " + m[1] + " dias"],
];

export function tr(s) {
  if (!isPT || !s) return s;
  const core = s.trim(); if (!core) return s;
  let out;
  if (Object.prototype.hasOwnProperty.call(T, core)) out = T[core];
  else if (Object.prototype.hasOwnProperty.call(T, s)) return T[s];
  else {
    for (const [re, fn] of P) { const m = core.match(re); if (m) { if (fn) out = fn(m); break; } }
    if (out == null) {
      // "2024 · Movie · 120 min · ★ 7.5" style meta lines
      if (core.includes(" · ")) { const parts = core.split(" · "); const tp = parts.map((x) => (x === "Series" ? "Série" : Object.prototype.hasOwnProperty.call(T, x) ? T[x] : tr(x))); if (tp.some((x, i) => x !== parts[i])) out = tp.join(" · "); }
    }
    if (out == null) return s;
  }
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
  return lead + out + trail;
}

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const NO_TEXT = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);
function fixNode(n) {
  if (n.nodeType === 3) { const p = n.parentElement; if (p && (NO_TEXT.has(p.nodeName) || p.closest("[translate=no]"))) return; const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
  if (n.nodeType !== 1 || n.getAttribute("translate") === "no") return;
  ATTRS.forEach((a) => { const v = n.getAttribute(a); if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } });
  if (!NO_TEXT.has(n.nodeName)) n.childNodes.forEach(fixNode);
}

export function startI18n() {
  document.documentElement.lang = isPT ? "pt-PT" : "en";
  if (!isPT) return;
  document.title = tr(document.title);
  fixNode(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "childList") m.addedNodes.forEach(fixNode);
      else if (m.type === "characterData") fixNode(m.target);
      else if (m.type === "attributes") { const v = m.target.getAttribute(m.attributeName); if (v) { const t = tr(v); if (t !== v) m.target.setAttribute(m.attributeName, t); } }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
