const socket = io();
let meuId = null;
let souAnfitriao = false;
let temaEscolhido = null;

const temas = {
    animais: { nome: 'Animais' },
    frutas: { nome: 'Frutas' },
    paises: { nome: 'Países e Capitais' },
    profissoes: { nome: 'Profissões' },
    comidas: { nome: 'Comidas e Pratos Típicos' },
    filmes: { nome: 'Filmes, Séries e Animes' },
    jogos: { nome: 'Jogos Eletrônicos e Tabuleiro' },
    esportes: { nome: 'Esportes' },
    objetos: { nome: 'Objetos do Dia a Dia' },
    natureza: { nome: 'Cores, Plantas ou Minerais' }
};

function mostrarTela(id) {
    document.querySelectorAll('.screen').forEach((s) => {
        if (!s.closest('#roomModal')) {
            s.style.display = 'none';
        }
    });
    document.getElementById(id).style.display = 'flex';
}

function prepararTelaSala(id, categoria) {
    document.getElementById('roomModal').style.display = 'none';
    mostrarTela('gameScreen');
    document.getElementById('idSalaTela').innerText = id;
    document.getElementById('temaSalaTela').innerText = categoria;
    atualizarForca(0);
}

function atualizarForca(erros) {
    document.querySelectorAll('.parte-corpo').forEach((parte) => {
        const nivel = parseInt(parte.getAttribute('data-erro'), 10);
        parte.classList.toggle('visivel', nivel <= erros);
    });
}

socket.on('connect', () => {
    meuId = socket.id;
});

// ==================== PERFIL ====================
function criarPerfil() {
    const apelido = document.getElementById('nicknameInput').value.trim();
    if (!apelido) return alert('Digite um apelido!');
    localStorage.setItem('nickname', apelido);
    document.getElementById('profileScreen').style.display = 'none';
    document.getElementById('roomModal').style.display = 'flex';
}

// ==================== TEMAS ====================
function escolherTemaVisual(tema) {
    document.body.setAttribute('data-tema', tema);
    document.querySelectorAll('.tema-visual-btn').forEach((b) => b.classList.remove('selecionado'));
    const botao = document.querySelector(`.tema-visual-btn[data-tema="${tema}"]`);
    if (botao) botao.classList.add('selecionado');
}

function escolherTema(chave) {
    temaEscolhido = chave;
    document.querySelectorAll('.categoria-btn').forEach((b) => b.classList.remove('selecionado'));
    const botao = document.querySelector(`.categoria-btn[data-categoria="${chave}"]`);
    if (botao) botao.classList.add('selecionado');
    document.getElementById('temaEscolhidoLabel').innerText = temas[chave].nome;
}

// ==================== CRIAR (ANFITRIÃO) ====================
function criarSala() {
    const apelido = localStorage.getItem('nickname') || document.getElementById('nicknameInput').value.trim();
    if (!apelido) return alert('Digite um apelido primeiro!');
    if (!temaEscolhido) return alert('Escolha uma categoria de palavras!');
    const palavra = document.getElementById('palavraSecretaInput').value.trim();
    if (!palavra) return alert('Digite a palavra secreta!');

    socket.emit('criarSala', {
        apelido,
        tema: temaEscolhido,
        palavra,
        maxAdivinhadores: parseInt(document.getElementById('maxAdivInput').value, 10)
    });
}

socket.on('salaCriada', ({ id, tema, maxAdivinhadores }) => {
    souAnfitriao = true;
    prepararTelaSala(id, temas[tema]?.nome || tema);
    document.getElementById('jogadoresTela').innerText = `Vagas para adivinhadores: ${maxAdivinhadores}`;
    document.getElementById('btnIniciar').style.display = 'block';
    document.getElementById('dicaInput').disabled = false;
    document.getElementById('btnEnviarDica').disabled = false;
    document.getElementById('statusJogo').innerText = 'Aguardando adivinhadores...';
});

// ==================== ENTRAR (ADIVINHADOR) ====================
function entrarSala() {
    const apelido = localStorage.getItem('nickname') || document.getElementById('nicknameInput').value.trim();
    if (!apelido) return alert('Digite um apelido primeiro!');
    const sala = document.getElementById('joinRoomInput').value.trim().toUpperCase();
    if (!sala) return alert('Digite o ID da sala!');
    socket.emit('entrarSala', { sala, apelido });
}

socket.on('salaEntrou', ({ id, tema }) => {
    souAnfitriao = false;
    prepararTelaSala(id, temas[tema]?.nome || tema);
    document.getElementById('statusJogo').innerText = 'Aguardando o anfitrião iniciar...';
});

socket.on('jogadoresAtualizados', ({ anfitriao, adivinhadores, faltam }) => {
    document.getElementById('jogadoresTela').innerText =
        `Anfitrião: ${anfitriao} | Adivinhadores: ${adivinhadores.join(', ') || 'nenhum ainda'} | Vagas restantes: ${faltam}`;
});

// ==================== INÍCIO ====================
socket.on('partidaIniciada', () => {
    document.getElementById('btnIniciar').style.display = 'none';
    document.getElementById('fimPartidaBox').style.display = 'none';
    document.getElementById('tempoTela').innerText = '15s';
    document.getElementById('statusJogo').innerText = 'Partida iniciada!';
    document.getElementById('areaFimAdivinhador').style.display = 'none';
    document.getElementById('cardResultadoAdivinhador').style.display = 'none';
    document.getElementById('cardResultadoAdivinhador').classList.remove('vitoria', 'derrota');
    atualizarForca(0);
});

function prepararNovaRodada() {
    const input = document.getElementById('novaPalavraInput');
    const palavra = input.value.trim();
    if (!palavra) {
        alert('Digite a nova palavra secreta para começar o novo jogo!');
        input.focus();
        return;
    }

    socket.emit('novaRodada', {
        palavra,
        tema: temaEscolhido || undefined
    });
    input.value = '';
}

function encerrarSala() {
    if (!confirm('Tem certeza que deseja encerrar a sala para todos?')) return;
    socket.emit('encerrarSala');
}

socket.on('rodadaPreparada', ({ tema, anfitriao, adivinhadores, faltam }) => {
    clearInterval(window._contador);
    document.getElementById('tempoTela').innerText = '15s';
    document.getElementById('temaSalaTela').innerText = temas[tema]?.nome || tema;
    document.getElementById('jogadoresTela').innerText =
        `Anfitrião: ${anfitriao} | Adivinhadores: ${adivinhadores.join(', ') || 'nenhum ainda'} | Vagas restantes: ${faltam}`;
    document.getElementById('fimPartidaBox').style.display = 'none';
    document.getElementById('letraInput').disabled = true;
    document.getElementById('chutarButton').disabled = true;
    document.getElementById('areaFimAdivinhador').style.display = 'none';
    document.getElementById('cardResultadoAdivinhador').style.display = 'none';
    document.getElementById('cardResultadoAdivinhador').classList.remove('vitoria', 'derrota');
    atualizarForca(0);

    if (souAnfitriao) {
        document.getElementById('btnIniciar').style.display = 'block';
        document.getElementById('statusJogo').innerText = 'Nova palavra definida! Clique em Iniciar partida.';
    } else {
        document.getElementById('btnIniciar').style.display = 'none';
        document.getElementById('statusJogo').innerText = 'Nova palavra definida! Aguardando o anfitrião iniciar...';
    }
});

function iniciarJogo() {
    socket.emit('iniciarJogo');
}

// ==================== GAMEPLAY ====================
socket.on('vezDoJogador', ({ id, apelido, tempo }) => {
    document.getElementById('statusJogo').innerText = `Vez de: ${apelido}`;
    const ehMinhaVez = id === meuId && !souAnfitriao;
    document.getElementById('letraInput').disabled = !ehMinhaVez;
    document.getElementById('chutarButton').disabled = !ehMinhaVez;

    if (ehMinhaVez) {
        document.getElementById('letraInput').focus();
    }

    let restante = tempo;
    clearInterval(window._contador);
    document.getElementById('tempoTela').innerText = `${restante}s`;
    window._contador = setInterval(() => {
        restante--;
        document.getElementById('tempoTela').innerText = `${Math.max(restante, 0)}s`;
        if (restante <= 0) clearInterval(window._contador);
    }, 1000);
});

socket.on('estadoAtualizado', (e) => {
    document.getElementById('palavraTela').innerText = e.palavraMascarada || '';
    document.getElementById('errosTela').innerText = `Erros: ${e.erros}/${e.maxErros}`;
    document.getElementById('letrasUsadas').innerText = e.letrasUsadas.length
        ? e.letrasUsadas.join(' - ').toUpperCase()
        : '—';

    atualizarForca(e.erros);

    const fimBox = document.getElementById('fimPartidaBox');
    const controlesHost = document.getElementById('controlesAnfitriaoFim');
    const areaGuest = document.getElementById('areaFimAdivinhador');
    const cardResultado = document.getElementById('cardResultadoAdivinhador');

    if (e.ganhou || e.acabou) {
        clearInterval(window._contador);
        document.getElementById('letraInput').disabled = true;
        document.getElementById('chutarButton').disabled = true;

        fimBox.style.display = 'flex';

        if (souAnfitriao) {
            controlesHost.style.display = 'flex';
            areaGuest.style.display = 'none';
            cardResultado.style.display = 'none';
            document.getElementById('novaPalavraInput')?.focus();
        } else {
            controlesHost.style.display = 'none';
            areaGuest.style.display = 'flex';
            cardResultado.style.display = 'block';
            cardResultado.classList.remove('vitoria', 'derrota');

            if (e.ganhou) {
                cardResultado.classList.add('vitoria');
                cardResultado.innerText = `🎉 Vocês venceram! A palavra era: ${e.palavra.toUpperCase()}`;
            } else {
                cardResultado.classList.add('derrota');
                cardResultado.innerText = `💀 Vocês perderam! A palavra era: ${e.palavra.toUpperCase()}`;
            }
        }
    } else {
        fimBox.style.display = 'none';
        controlesHost.style.display = 'none';
        areaGuest.style.display = 'none';
        cardResultado.style.display = 'none';
        cardResultado.classList.remove('vitoria', 'derrota');
    }
});

socket.on('fimDeTempo', ({ apelido }) => {
    addDicaNoChat(`⏰ Tempo esgotado de ${apelido}! Contou 1 erro.`);
});

function chutar() {
    const input = document.getElementById('letraInput');
    if (!input.value.trim()) return;
    socket.emit('chutarLetra', { letra: input.value });
    input.value = '';
}

// ==================== CHAT DE DICAS ====================
function enviarDica() {
    const input = document.getElementById('dicaInput');
    if (!input.value.trim()) return;
    socket.emit('enviarDica', { dica: input.value });
    input.value = '';
}

socket.on('novaDica', ({ de, texto, hora }) => {
    addDicaNoChat(`[${hora}] ${de}: ${texto}`);
});

function addDicaNoChat(msg) {
    const chat = document.getElementById('chatDicas');
    const linha = document.createElement('p');
    linha.innerText = msg;
    chat.appendChild(linha);
    chat.scrollTop = chat.scrollHeight;
}

socket.on('erro', (msg) => alert(msg));

socket.on('salaEncerrada', () => {
    clearInterval(window._contador);
    alert('O anfitrião encerrou a sala.');
    location.reload();
});

// ==================== ATALHOS COM ENTER ====================
document.getElementById('nicknameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') criarPerfil();
});

document.getElementById('letraInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') chutar();
});

document.getElementById('dicaInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enviarDica();
});

document.getElementById('novaPalavraInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') prepararNovaRodada();
});