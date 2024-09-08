const quizData = [];
let quizLength = 20;
let isRetryMode = false;
let currentQuestionIndex = 0;
let correctAnswers = 0;
let missedQuestions = [];
let timerInterval;
let timeLeft = 10;
const fullCircle = 113;
const localStorageKey = 'multiplicationQuizData';
const statsKeyPrefix = 'multiplicationStats_';

document.getElementById('startQuiz').addEventListener('click', startQuiz);
document.getElementById('submitAnswer').addEventListener('click', submitAnswer);
document.getElementById('backToMenu').addEventListener('click', showMenu);
document.getElementById('retryErrors').addEventListener('click', retryErrors);
document.getElementById('answer').addEventListener('keyup', (event) => {
    if (event.key === 'Enter') submitAnswer();
});

function startQuiz() {
    quizLength = 20;
    quizData.length = 0;
    missedQuestions = [];
    currentQuestionIndex = 0;
    correctAnswers = 0;
    for (let i = 0; i < quizLength; i++) {
        quizData.push(generateQuestion());
    }
    showQuiz();
    displayQuestion();
}

function resetAndStartTimer() {
    timeLeft = 10;
    const circle = document.querySelector(".countdown circle");
    const timeDisplay = document.getElementById("timeDisplay");
    timeDisplay.innerText = timeLeft;
    circle.style.strokeDashoffset = 0;

    timerInterval = setInterval(() => {
        updateTimer(circle, timeDisplay);
    }, 1000);
}

function updateTimer(circle, timeDisplay) {
    timeLeft--;
    const offset = (fullCircle / 9) * (10 - timeLeft);
    circle.style.strokeDashoffset = offset;
    timeDisplay.innerText = timeLeft;

    if (timeLeft <= 3) {
        circle.classList.replace('hight-time', 'low-time');
    } else {
        circle.classList.replace('low-time', 'hight-time');
    }

    if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timeDisplay.innerText = 0;
        submitAnswer();
    }
}

function generateQuestion() {
    let num1, num2;
    do {
        num1 = Math.floor(Math.random() * 13);
        num2 = Math.floor(Math.random() * 13);
    } while (isMasteredQuestion(num1, num2));
    return { num1, num2 };
}

function isMasteredQuestion(num1, num2) {
    const key = `${statsKeyPrefix}${num1}x${num2}`;
    const stats = JSON.parse(localStorage.getItem(key)) || { success: 0, errors: 0, consecutive: 0 };
    return stats.consecutive >= 3;
}

function displayQuestion() {
    const question = quizData[currentQuestionIndex];
    document.getElementById('question').innerText = `${question.num1} x ${question.num2} = ?`;
    document.getElementById('progressTracker').innerText = `Question ${currentQuestionIndex + 1} sur ${quizLength}`;

    clearInterval(timerInterval);
    resetAndStartTimer();
    updateProgressBar();
}

function submitAnswer() {
    const answerInput = document.getElementById('answer');
    const userAnswer = parseInt(answerInput.value);
    if (isNaN(userAnswer)) {
        showFeedback(false);
        return;
    }

    const question = quizData[currentQuestionIndex];
    const correctAnswer = question.num1 * question.num2;

    if (userAnswer === correctAnswer) {
        correctAnswers++;
        if (!isRetryMode) { // Ne pas mettre à jour les stats en mode reprise
            updateStats(question, true);
        }
        showFeedback(true);
    } else {
        if (!isRetryMode) { // Seulement ajouter à missedQuestions si ce n'est pas une reprise
            missedQuestions.push({ num1: question.num1, num2: question.num2 });
            updateStats(question, false);
        }
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
    if (isRetryMode) return; // Ne pas mettre à jour les stats pendant la reprise des erreurs

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
    const date = formatDate(new Date());
    
    const resultEntry = {
        date,
        correct: correctAnswers,
        missed: quizData.length - correctAnswers,
        isRetry: isRetryMode // Indiquer si c'était une reprise d'erreurs
    };

    results.push(resultEntry);
    localStorage.setItem(localStorageKey, JSON.stringify(results));
    
    isRetryMode = false; // Réinitialiser le mode après la sauvegarde des résultats
}

function getResults() {
    return JSON.parse(localStorage.getItem(localStorageKey)) || [];
}

function showResults() {
    document.getElementById('quiz').classList.add('hidden');
    document.getElementById('result').classList.remove('hidden');

    const scoreMessage = `Votre score : ${correctAnswers} / ${quizLength}`;
    const resultElement = document.getElementById('result');
    resultElement.querySelector('h2')?.remove();
    resultElement.insertAdjacentHTML('afterbegin', `<h2>${scoreMessage}</h2>`);

    const missedList = document.getElementById('missedQuestions');
    missedList.innerHTML = missedQuestions.map(q => `<li>${q.num1} x ${q.num2} = ${q.num1 * q.num2}</li>`).join('');

    const retryButton = document.getElementById('retryErrors');
    if (missedQuestions.length > 0) {
        retryButton.classList.remove('hidden');
        retryButton.disabled = false;
    } else {
        retryButton.classList.add('hidden');
    }
}

function retryErrors() {
    isRetryMode = true; // Activer le mode de reprise des erreurs
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
        <li>${result.date} - <strong> ${result.correct} / ${result.correct+result.missed} </strong>  ${result.isRetry ? '(Reprise des erreurs)' : ''}</li>
        `).join('');
        // <li>${result.date} - Correctes: ${result.correct}, Manquées: ${result.missed} ${result.isRetry ? '(Reprise des erreurs)' : ''}</li>
}


function showFeedback(isCorrect) {
    const feedback = document.getElementById('feedback');
    feedback.classList.remove('hidden');
    feedback.innerText = isCorrect ? "Bravo ! C'est correct." : "Dommage, ce n'est pas correct.";
    feedback.classList.toggle('correct', isCorrect);
    feedback.classList.toggle('wrong', !isCorrect);

    setTimeout(() => feedback.classList.add('hidden'), 2000);
}

function displayMultiplicationStats() {
    const statsTable = document.getElementById('statsTable');
    statsTable.innerHTML = '';

    let headerRow = document.createElement('div');
    headerRow.classList.add('header');
    statsTable.appendChild(headerRow);
    for (let i = 0; i < 13; i++) {
        let headerCell = document.createElement('div');
        headerCell.classList.add('header');
        headerCell.innerText = i;
        statsTable.appendChild(headerCell);
    }

    for (let i = 0; i < 13; i++) {
        let rowHeader = document.createElement('div');
        rowHeader.classList.add('header');
        rowHeader.innerText = i;
        statsTable.appendChild(rowHeader);

        for (let j = 0; j < 13; j++) {
            const key = `${statsKeyPrefix}${i}x${j}`;
            const stats = JSON.parse(localStorage.getItem(key)) || { success: 0, errors: 0, consecutive: 0 };
            const cell = document.createElement('div');

            if (stats.consecutive >= 3) {
                cell.classList.add('blue-bg');
                cell.innerHTML = '<i class="fas fa-thumbs-up"></i>';
            } else if (stats.errors > stats.success) {
                cell.classList.add('red-bg');
                cell.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
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

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Les mois commencent à 0
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

showMenu();
