const socket = io();

// ==================== PERFIL ====================
let id_player = null;
let salaAtual = '';
let souCriador = false;
let palavraDefinida = false;
let jogadoresNaSala = 0;
let categoriaSala = null;
let temaEscolhido = null;
let temaVisualEscolhido = 'classico';

const temas = {
    animais: { nome: 'Animais' },
    frutas: { nome: 'Frutas e Alimentos' },
    paises: { nome: 'Países e Capitais' },
    profissoes: { nome: 'Profissões' },
    filmes: { nome: 'Filmes e Séries' },
    objetos: { nome: 'Objetos' },
    cores: { nome: 'Cores' },
    esportes: { nome: 'Esportes' },
    desenhos: { nome: 'Desenhos e Animes' },
    marcas: { nome: 'Marcas e Empresas' }
};

function atualizarControlesPalpite() {
    const partidaPronta = palavraDefinida && jogadoresNaSala === 2;
    document.getElementById('letraInput').disabled = !partidaPronta;
    document.getElementById('chutarButton').disabled = !partidaPronta;
}

function atualizarPainelPalavra() {
    const mostrar = souCriador && !palavraDefinida && !categoriaSala;
    document.getElementById('definirPalavraBox').style.display = mostrar ? 'flex' : 'none';
}

function criarPerfil() {
    const nickname = document.getElementById('nicknameInput').value.trim();
    if (!nickname) return alert('Digite um apelido!');

    id_player = localStorage.getItem('id_player') || 'p' + Date.now();
    localStorage.setItem('id_player', id_player);
    localStorage.setItem('nickname', nickname);

    document.getElementById('profileScreen').style.display = 'none';
    document.getElementById('roomModal').style.display = 'flex';
}

// ==================== CATEGORIAS E TEMA VISUAL ====================
function escolherTema(chave) {
    if (!temas[chave]) return;

    temaEscolhido = chave;
    document.querySelectorAll('.categoria-btn').forEach((botao) => {
        botao.classList.remove('selecionado');
    });
    document.querySelector(`[data-categoria="${chave}"]`).classList.add('selecionado');
    document.getElementById('temaEscolhidoLabel').textContent = temas[chave].nome;
}

function escolherTemaVisual(tema) {
    temaVisualEscolhido = tema;
    document.querySelectorAll('.tema-visual-btn').forEach((botao) => {
        botao.classList.remove('selecionado');
    });
    document.querySelector(`[data-tema="${tema}"]`).classList.add('selecionado');
}

// ==================== SALAS ====================
function gerarIdSala(tamanho = 6) {
    const caracteres = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < tamanho; i++) {
        id += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return id;
}

function criarSala() {
    if (!temaEscolhido) return alert('Escolha uma categoria!');

    salaAtual = gerarIdSala();
    socket.emit('entrarSala', {
        sala: salaAtual,
        apelido: localStorage.getItem('nickname'),
        tema: temaVisualEscolhido,
        categoria: temaEscolhido,
        acao: 'criar'
    });
}

function entrarSala() {
    const salaId = document.getElementById('joinRoomInput').value.trim().toUpperCase();
    if (!salaId) return alert('Digite o ID da sala!');

    salaAtual = salaId;
    socket.emit('entrarSala', {
        sala: salaId,
        apelido: localStorage.getItem('nickname'),
        tema: null,
        categoria: null,
        acao: 'entrar'
    });
}

// ==================== EVENTOS DO SERVIDOR ====================
socket.on('connect', () => console.log('Conectado:', socket.id));

socket.on('aplicarTema', ({ tema }) => {
    document.body.setAttribute('data-tema', tema);
});

socket.on('permissaoDefinirPalavra', ({ podeDefinir, palavraDefinida: definida }) => {
    souCriador = podeDefinir;
    palavraDefinida = definida;
    atualizarPainelPalavra();
    atualizarControlesPalpite();
});

socket.on('palavraDefinida', () => {
    palavraDefinida = true;
    document.getElementById('definirPalavraBox').style.display = 'none';
    document.getElementById('palavraInput').value = '';
    atualizarControlesPalpite();
    document.getElementById('statusJogo').textContent = jogadoresNaSala === 2
        ? 'Palavra definida. A partida pode começar!'
        : 'Palavra definida. Aguardando oponente.';
});

socket.on('jogadoresAtualizados', (jogadores) => {
    jogadoresNaSala = jogadores.length;
    document.getElementById('profileScreen').style.display = 'none';
    document.getElementById('roomModal').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'flex';
    document.getElementById('idSalaTela').textContent = salaAtual;
    document.getElementById('jogadoresTela').textContent = jogadores.join(' vs ');
    atualizarControlesPalpite();
    document.getElementById('statusJogo').textContent = jogadores.length < 2
        ? `Aguardando oponente... (${jogadores.length}/2)`
        : palavraDefinida
            ? 'Partida iniciando...'
            : 'Aguardando o criador definir a palavra.';
});

socket.on('salaInfo', ({ id, tema, categoria, jogadores }) => {
    salaAtual = id;
    categoriaSala = categoria || tema;
    document.getElementById('idSalaTela').textContent = id;
    document.getElementById('temaSalaTela').textContent =
        temas[categoriaSala] ? temas[categoriaSala].nome : 'Personalizada';
    document.getElementById('jogadoresTela').textContent = jogadores.join(' vs ');
    atualizarPainelPalavra();
});

socket.on('salaCheia', () => alert('Esta sala já está cheia.'));
socket.on('salaNaoEncontrada', () => alert('Sala não encontrada. Confira o ID e tente novamente.'));
socket.on('erro', (mensagem) => alert(mensagem));

socket.on('iniciarPartida', ({ vezDe }) => {
    document.getElementById('statusJogo').textContent = palavraDefinida
        ? `Partida iniciada! Vez de ${vezDe}.`
        : 'Partida pronta. Aguardando o criador definir a palavra.';
});

socket.on('estadoAtualizado', (estado) => {
    document.getElementById('statusJogo').textContent =
        `Erros: ${estado.erros}/6 | Vez de: ${estado.vezDe}`;
    document.getElementById('letrasUsadas').textContent =
        estado.letrasUsadas.join(' - ').toUpperCase();

    if (estado.ganhou) {
        document.getElementById('statusJogo').textContent =
            `🎉 Vitória! A palavra era: ${estado.palavra}`;
    } else if (estado.perdeu) {
        document.getElementById('statusJogo').textContent =
            `💀 Enforcado! A palavra era: ${estado.palavra}`;
    }

    if (estado.ganhou || estado.perdeu) {
        document.getElementById('letraInput').disabled = true;
        document.getElementById('chutarButton').disabled = true;
    }
});

socket.on('oponenteSaiu', () => {
    document.getElementById('statusJogo').textContent = 'O oponente saiu da sala.';
});

function definirPalavra() {
    const input = document.getElementById('palavraInput');
    const palavra = input.value.trim().toLowerCase();
    if (!palavra) return alert('Digite uma palavra secreta.');

    socket.emit('definirPalavra', { sala: salaAtual, palavra });
}

function chutar() {
    const input = document.getElementById('letraInput');
    const letra = input.value.trim().toLowerCase();
    if (letra.length !== 1) return alert('Digite uma única letra.');

    socket.emit('chutarLetra', { sala: salaAtual, letra });
    input.value = '';
}
