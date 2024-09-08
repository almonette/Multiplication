const quizData = [];
let quizLength = 20;
let currentQuestionIndex = 0;
let correctAnswers = 0;
let missedQuestions = [];
let timerInterval; // Intervalle pour gérer le décompte
let timeLeft = 10; // Temps par question
const fullCircle = 113; // Longueur du cercle pour l'animation
const localStorageKey = 'multiplicationQuizData';
const statsKeyPrefix = 'multiplicationStats_';

document.getElementById('startQuiz').addEventListener('click', startQuiz);
document.getElementById('submitAnswer').addEventListener('click', submitAnswer);
document.getElementById('backToMenu').addEventListener('click', showMenu);
document.getElementById('retryErrors').addEventListener('click', retryErrors);
document.getElementById('answer').addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
        submitAnswer(); // Appel de la fonction submitAnswer si "Enter" est pressé
    }
});

function startQuiz() {
    quizLength = 20;
    quizData.length = 0;
    missedQuestions = [];
    currentQuestionIndex = 0;
    correctAnswers = 0;
    for (let i = 0; i < quizLength; i++) {
        const question = generateQuestion();
        quizData.push(question);
    }
    showQuiz();
    displayQuestion();
}

function startTimer() {
    timeLeft = 10; // Réinitialiser le temps
    const circle = document.querySelector(".countdown circle");
    const timeDisplay = document.getElementById("timeDisplay"); 
    timeDisplay.innerText = timeLeft; 

    // Réinitialiser immédiatement le dashoffset pour démarrer la progression du cercle
    let offset = 0;
    circle.style.strokeDashoffset = offset;

    // Démarrer le timer
    timerInterval = setInterval(() => {
        timeLeft--;

        // Calculer la nouvelle longueur du cercle
        offset = (fullCircle / 9) * (10 - timeLeft);
        circle.style.strokeDashoffset = offset;

        // Mettre à jour l'affichage du temps
        timeDisplay.innerText = timeLeft;

        // Changer la couleur du cercle quand il reste moins de 3 secondes
        if (timeLeft <= 3) {
            circle.classList.remove('hight-time');
            circle.classList.add('low-time');
        } else {
            circle.classList.remove('low-time');
            circle.classList.add('hight-time');
        }

        // Si le temps est écoulé
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timeDisplay.innerText = 0; // Afficher 0 au bon moment
            submitAnswer(); // Appeler submitAnswer automatiquement après 10 secondes
        }

    }, 1000);
}

function generateQuestion() {
    let num1, num2;
    do {
        num1 = Math.floor(Math.random() * 13);
        num2 = Math.floor(Math.random() * 13);
    } while (isMasteredQuestion(num1, num2)); // Vérifie si la question est maîtrisée

    return { num1, num2 };
}

function isMasteredQuestion(num1, num2) {
    const key = `${statsKeyPrefix}${num1}x${num2}`;
    const stats = JSON.parse(localStorage.getItem(key)) || { success: 0, errors: 0, consecutive: 0 };
    return stats.consecutive >= 3; // Considère la question comme maîtrisée si 3 réussites consécutives
}

function displayQuestion() {
    const question = quizData[currentQuestionIndex];
    document.getElementById('question').innerText = `${question.num1} x ${question.num2} = ?`;
    document.getElementById('progressTracker').innerText = `Question ${currentQuestionIndex + 1} sur ${quizLength}`;

    clearInterval(timerInterval); // Réinitialiser le timer pour chaque nouvelle question
    startTimer(); // Démarrer le décompte
    updateProgressBar(); // Mettre à jour la barre de progression
}

function submitAnswer() {
    const answerInput = document.getElementById('answer');
    const userAnswer = parseInt(answerInput.value);
    const question = quizData[currentQuestionIndex];
    const correctAnswer = question.num1 * question.num2;

    if (userAnswer === correctAnswer) {
        correctAnswers++;
        updateStats(question, true);
        showFeedback(true);
    } else {
        missedQuestions.push({ num1: question.num1, num2: question.num2 });
        updateStats(question, false);
        showFeedback(false);
    }

    currentQuestionIndex++;
    if (currentQuestionIndex < quizData.length) {
        displayQuestion();
    } else {
        endQuiz();
    }

    answerInput.value = '';
    answerInput.focus(); 
}

function updateProgressBar() {
    const progressBar = document.getElementById('progress-bar');
    const progressPercentage = ((currentQuestionIndex + 1) / quizLength) * 100;
    progressBar.style.width = `${progressPercentage}%`;
}

function updateStats(question, isCorrect) {
    const key = `${statsKeyPrefix}${question.num1}x${question.num2}`;
    const stats = JSON.parse(localStorage.getItem(key)) || { success: 0, errors: 0, consecutive: 0 };

    if (isCorrect) {
        stats.success++;
        stats.consecutive++;
    } else {
        stats.errors++;
        stats.consecutive = 0; // Réinitialiser les réussites consécutives en cas d'erreur
    }

    localStorage.setItem(key, JSON.stringify(stats));
}

function endQuiz() {
    saveResults();
    showResults();
}

function saveResults() {
    const results = getResults();
    const date = new Date().toLocaleString();
    results.push({ date, correct: correctAnswers, missed: missedQuestions.length });
    localStorage.setItem(localStorageKey, JSON.stringify(results));
}

function getResults() {
    return JSON.parse(localStorage.getItem(localStorageKey)) || [];
}

function showResults() {
    document.getElementById('quiz').classList.add('hidden');
    document.getElementById('result').classList.remove('hidden');
    
    const resultElement = document.getElementById('result');
    
    // Remplacer le contenu existant par le score
    const scoreMessage = `Votre score : ${correctAnswers} / ${quizLength}`;
    resultElement.querySelector('h2')?.remove(); // Supprimer le précédent score s'il existe
    resultElement.insertAdjacentHTML('afterbegin', `<h2>${scoreMessage}</h2>`);
    
    const missedList = document.getElementById('missedQuestions');
    missedList.innerHTML = missedQuestions.map(q => `<li>${q.num1} x ${q.num2} = ${q.num1 * q.num2}</li>`).join('');

    // Si l'utilisateur a manqué des questions, afficher le bouton "Revoir les erreurs"
    const retryButton = document.getElementById('retryErrors');
    
    if (missedQuestions.length > 0) {
        retryButton.classList.remove('hidden');
        retryButton.disabled = false; // Activer le bouton s'il y a des erreurs
    } else {
        retryButton.classList.add('hidden'); // Masquer le bouton s'il n'y a pas d'erreurs
    }
}

function retryErrors() {
    quizData.length = 0;
    quizData.push(...missedQuestions); // Conserver les questions manquées
    missedQuestions = []; // Réinitialiser les questions manquées

    currentQuestionIndex = 0;
    correctAnswers = 0;
    quizLength = quizData.length; // Adapter la longueur du quiz

    document.getElementById('result').classList.add('hidden');
    showQuiz();
    displayQuestion();
}


function showMenu() {
    document.getElementById('result').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
    displayLastResults();
    displayMultiplicationStats();
}

function showQuiz() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('quiz').classList.remove('hidden');
    document.getElementById('answer').focus(); 
}

function displayLastResults() {
    const results = getResults();
    const lastResultsList = document.getElementById('lastResults');
    lastResultsList.innerHTML = results.slice(-10).map(result => `
        <li>${result.date} - Correctes: ${result.correct}, Manquées: ${result.missed}</li>
    `).join('');
}

function showFeedback(isCorrect) {
    const feedback = document.getElementById('feedback');
    feedback.classList.remove('hidden');
    
    if (isCorrect) {
        feedback.innerText = "Bravo ! C'est correct.";
        feedback.classList.add('correct');
        feedback.classList.remove('wrong');
    } else {
        feedback.innerText = "Dommage, ce n'est pas correct.";
        feedback.classList.add('wrong');
        feedback.classList.remove('correct');
    }

    // Optionnel : masquer le feedback après un certain temps
    setTimeout(() => {
        feedback.classList.add('hidden');
    }, 2000);
}

function displayMultiplicationStats() {
    const statsTable = document.getElementById('statsTable');
    statsTable.innerHTML = '';

    // En-têtes de colonnes
    let headerRow = document.createElement('div');
    headerRow.classList.add('header');
    statsTable.appendChild(headerRow); // Cellule vide pour l'index de ligne
    for (let i = 0; i < 13; i++) {
        let headerCell = document.createElement('div');
        headerCell.classList.add('header');
        headerCell.innerText = i;
        statsTable.appendChild(headerCell);
    }

    // Statistiques par multiplication
    for (let i = 0; i < 13; i++) {
        let rowHeader = document.createElement('div');
        rowHeader.classList.add('header');
        rowHeader.innerText = i;
        statsTable.appendChild(rowHeader);

        for (let j = 0; j < 13; j++) {
            const key = `${statsKeyPrefix}${i}x${j}`;
            const stats = JSON.parse(localStorage.getItem(key)) || { success: 0, errors: 0, consecutive: 0 };
            const cell = document.createElement('div');
            
            // Définir le style et le contenu visuel des cases en fonction des statistiques
            if (stats.consecutive >= 3) {
                cell.classList.add('blue-bg');
                cell.innerHTML = '<i class="fas fa-thumbs-up"></i>'; // Icône pouce en l'air
            } else if (stats.errors > stats.success) {
                cell.classList.add('red-bg');
                cell.innerHTML = '<i class="fas fa-exclamation-circle"></i>'; // Icône d'avertissement
            } else if (stats.success > stats.errors) {
                cell.classList.add('green-bg');
                cell.innerHTML = `<span class="consecutive-count">${stats.consecutive}</span>`;
            } else {
                cell.classList.add('neutral-bg');
                cell.innerHTML = '-';
            }

            statsTable.appendChild(cell);
        }
    }
}

showMenu();
