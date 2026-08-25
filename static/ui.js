// МОДУЛЬ UI ДЛЯ 8OLLAR TAP
const ui = {
    // Открыть шторку по ID
    openPanel: function(panelType) {
        // Сначала закрываем все открытые шторки
        this.closeAllPanels();
        
        // Находим нужную панель по ID
        const panel = document.getElementById(`${panelType}-panel`);
        if (panel) {
            panel.classList.add('open');
        }

        // Подсвечиваем соответствующую кнопку в меню
        this.updateNavButtons(panelType);
    },

    // Закрыть вообще все панели и вернуться на главный экран игры
    closeAllPanels: function() {
        const panels = document.querySelectorAll('.panel');
        panels.forEach(panel => {
            panel.classList.remove('open');
        });
        
        this.updateNavButtons('game');
    },

    // Переключение активного класса на кнопках нижнего меню
    updateNavButtons: function(activeType) {
        const buttons = document.querySelectorAll('.nav-btn');
        buttons.forEach(btn => btn.classList.remove('active'));

        // Ищем кнопку по тексту или вызову
        buttons.forEach(btn => {
            if (activeType === 'shop' && btn.getAttribute('onclick').includes('shop')) {
                btn.classList.add('active');
            } else if (activeType === 'top' && btn.getAttribute('onclick').includes('top')) {
                btn.classList.add('active');
            } else if (activeType === 'game' && btn.getAttribute('onclick').includes('closeAllPanels')) {
                btn.classList.add('active');
            }
        });
    },

    // Функция обновления ЖИВОГО баланса юзера в Топе (вызывается из бэкенда/core.js)
    updateLiveUserTopBalance: function(amount) {
        const liveBalanceEl = document.getElementById('live-user-balance');
        if (liveBalanceEl) {
            liveBalanceEl.innerText = parseFloat(amount).toFixed(2) + ' $';
        }
    },

    // Функция обновления баланса Кристаллов в магазине
    updatePremiumGemsBalance: function(gems) {
        const gemsEl = document.getElementById('premium-gems-balance');
        if (gemsEl) {
            gemsEl.innerText = parseInt(gems);
        }
    }
};

// Инициализация событий при старте (если необходимо)
document.addEventListener('DOMContentLoaded', () => {
    // По дефолту кнопка "Игра" активна
    ui.updateNavButtons('game');
});
