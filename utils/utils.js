export function createMenu(game, div) {
    // Clear any existing content
    div.innerHTML = '';

    // menu style
    div.classList.add('menu');
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'center';
    div.style.visibility = 'hidden';
    div.style.position = 'fixed';
    div.style.width = '500px';
    div.style.height = '500px'; // Augmenté pour accueillir plus d'options
    div.style.backgroundColor = '#c1e1ec';
    div.style.border = '2px solid';
    div.style.zIndex = '1000';

    // title
    const title = document.createElement('h3');
    title.innerHTML = 'Pause';
    title.style.fontFamily = "'Press Start 2P', sans-serif";
    div.appendChild(title);

    // hr
    const hr = document.createElement('hr');
    hr.style.width = '100%';
    div.appendChild(hr);

    // Fonction helper pour créer les boutons du menu
    function createMenuButton(text, onClick) {
        const button = document.createElement('span');
        button.innerHTML = text;
        button.style.margin = '30px 0';
        button.style.padding = '10px';
        button.style.border = '2px solid';
        button.style.width = '150px';
        button.style.textAlign = 'center';
        button.style.fontFamily = "'Press Start 2P', sans-serif";
        button.style.cursor = 'pointer';

        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = 'lightblue';
        });

        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = 'transparent';
        });

        button.addEventListener('click', onClick);
        return button;
    }

    // Resume (maintenu pour compatibilité)
    const resume = createMenuButton('Resume', () => {
        game.paused = false;
        div.style.visibility = 'hidden';  // Cacher le menu
        div.style.display = 'none';       // Important pour qu'il n'intercepte pas les clicks
    });
    div.appendChild(resume);

    // restart - Modifier pour redémarrer seulement le niveau actuel
    const restart = createMenuButton('Restart', () => {
        game.paused = false;
        div.style.visibility = 'hidden';  // Cacher le menu
        div.style.display = 'none';       // Important

        // Utiliser resetCurrentLevel au lieu de restart
        if (game.resetCurrentLevel) {
            game.resetCurrentLevel();
        } else {
            // Fallback si la méthode n'existe pas
            game.restart();
        }
    });
    div.appendChild(restart);

    // Options button
    const options = createMenuButton('Options', () => {
        showOptionsMenu(game, div);
    });
    div.appendChild(options);
}

// Objet global pour stocker les réglages audio persistants
if (!window.audioSettings) {
    window.audioSettings = {
        masterVolume: 1.0,
        categories: {
            'sfx': 1.0,
            'music': 0.4,
            'ambient': 0.6
        },
        musicRotation: true
    };
}

// Nouvelle fonction pour afficher le menu d'options
function showOptionsMenu(game, parentDiv) {
    // Clear le contenu
    parentDiv.innerHTML = '';

    // Title
    const title = document.createElement('h3');
    title.innerHTML = 'Options';
    title.style.fontFamily = "'Press Start 2P', sans-serif";
    parentDiv.appendChild(title);

    // hr
    const hr = document.createElement('hr');
    hr.style.width = '100%';
    parentDiv.appendChild(hr);

    // Conteneur pour les options audio
    const audioOptionsDiv = document.createElement('div');
    audioOptionsDiv.style.width = '100%';
    audioOptionsDiv.style.padding = '10px';

    // Titre de la section audio
    const audioTitle = document.createElement('h4');
    audioTitle.innerHTML = 'Audio Settings';
    audioTitle.style.fontFamily = "'Press Start 2P', sans-serif";
    audioTitle.style.textAlign = 'center';
    audioOptionsDiv.appendChild(audioTitle);

    // Utiliser les réglages sauvegardés globalement
    const audioSettings = window.audioSettings;

    // Fonction helper pour créer un slider
    function createVolumeSlider(label, category, initialValue) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'space-between';
        container.style.margin = '15px 0';

        const labelEl = document.createElement('span');
        labelEl.innerHTML = label;
        labelEl.style.fontFamily = "'Press Start 2P', sans-serif";
        labelEl.style.fontSize = '12px';
        labelEl.style.width = '120px';

        const sliderContainer = document.createElement('div');
        sliderContainer.style.display = 'flex';
        sliderContainer.style.alignItems = 'center';
        sliderContainer.style.flex = '1';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = Math.floor(initialValue * 100);
        slider.style.flex = '1';

        const valueDisplay = document.createElement('span');
        valueDisplay.innerHTML = Math.floor(initialValue * 100) + '%';
        valueDisplay.style.fontFamily = "'Press Start 2P', sans-serif";
        valueDisplay.style.fontSize = '12px';
        valueDisplay.style.width = '50px';
        valueDisplay.style.textAlign = 'right';
        valueDisplay.style.marginLeft = '10px';

        slider.oninput = function () {
            const value = parseInt(this.value) / 100;
            valueDisplay.innerHTML = this.value + '%';

            // Sauvegarder le réglage dans l'objet global
            if (category === 'master') {
                window.audioSettings.masterVolume = value;
            } else {
                window.audioSettings.categories[category] = value;
            }

            // Mettre à jour le réglage audio en temps réel
            if (window.audioSystem) {
                if (category === 'master') {
                    window.audioSystem.setVolumeForAllEntities('master', value);
                } else {
                    window.audioSystem.setVolumeForAllEntities(category, value);
                }
            }
        };

        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(valueDisplay);

        container.appendChild(labelEl);
        container.appendChild(sliderContainer);

        return container;
    }

    // Créer les sliders pour chaque catégorie
    audioOptionsDiv.appendChild(createVolumeSlider('Master Volume', 'master', audioSettings.masterVolume));
    audioOptionsDiv.appendChild(createVolumeSlider('Sound Effects', 'sfx', audioSettings.categories.sfx));
    audioOptionsDiv.appendChild(createVolumeSlider('Music', 'music', audioSettings.categories.music));
    audioOptionsDiv.appendChild(createVolumeSlider('Ambient', 'ambient', audioSettings.categories.ambient));

    // Option pour activer/désactiver la rotation des thèmes musicaux
    const musicRotationDiv = document.createElement('div');
    musicRotationDiv.style.display = 'flex';
    musicRotationDiv.style.alignItems = 'center';
    musicRotationDiv.style.margin = '15px 0';

    const rotationLabel = document.createElement('span');
    rotationLabel.innerHTML = 'Music Rotation';
    rotationLabel.style.fontFamily = "'Press Start 2P', sans-serif";
    rotationLabel.style.fontSize = '12px';
    rotationLabel.style.width = '120px';

    const rotationCheckbox = document.createElement('input');
    rotationCheckbox.type = 'checkbox';
    rotationCheckbox.checked = window.audioSettings.musicRotation; // Utiliser la valeur sauvegardée

    rotationCheckbox.onchange = function () {
        // Sauvegarder dans l'objet global
        window.audioSettings.musicRotation = this.checked;

        if (window.audioSystem) {
            window.audioSystem.toggleMusicRotation(this.checked);
        }
    };

    musicRotationDiv.appendChild(rotationLabel);
    musicRotationDiv.appendChild(rotationCheckbox);
    audioOptionsDiv.appendChild(musicRotationDiv);

    parentDiv.appendChild(audioOptionsDiv);

    // Bouton Retour
    const backButton = document.createElement('span');
    backButton.innerHTML = 'Back';
    backButton.style.margin = '30px 0';
    backButton.style.padding = '10px';
    backButton.style.border = '2px solid';
    backButton.style.fontFamily = "'Press Start 2P', sans-serif";
    backButton.style.cursor = 'pointer';

    backButton.addEventListener('mouseover', () => {
        backButton.style.backgroundColor = 'lightblue';
    });

    backButton.addEventListener('mouseout', () => {
        backButton.style.backgroundColor = 'transparent';
    });

    backButton.addEventListener('click', () => {
        // Au lieu de restaurer le HTML qui perd les event listeners,
        // recréer complètement le menu principal
        createMenu(game, parentDiv);
    });

    parentDiv.appendChild(backButton);
}

// Modification du menu principal pour ajouter le bouton d'options
export function createMainMenu(gameInstance, container) {
    // Créer le conteneur du menu
    const menuContainer = document.createElement('div');
    menuContainer.style.position = 'fixed';
    menuContainer.style.top = '0';
    menuContainer.style.left = '0';
    menuContainer.style.width = '100%';
    menuContainer.style.height = '100%';
    menuContainer.style.display = 'flex';
    menuContainer.style.justifyContent = 'center';
    menuContainer.style.alignItems = 'center';
    menuContainer.style.backgroundColor = 'rgba(158, 161, 144, 0.8)';
    menuContainer.style.backgroundImage = "url('assets/cutscenes/map3_to_map4/frame_2.webp')";
    menuContainer.style.backgroundSize = 'cover';
    menuContainer.style.backgroundPosition = 'center';
    menuContainer.style.backgroundRepeat = 'no-repeat';
    menuContainer.style.zIndex = '1000';

    // Créer le menu
    const menu = document.createElement('div');
    menu.style.backgroundColor = 'rgba(176, 159, 119, 0.8)';
    menu.style.opacity = '0.9';
    menu.style.padding = '2rem';
    menu.style.borderRadius = '10px';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.gap = '1rem';
    menu.style.minWidth = '300px';

    // Titre
    const title = document.createElement('h1');
    title.textContent = 'Rodrigo Jack et les 6 talismans';
    title.style.color = 'black';
    title.style.textAlign = 'center';
    title.style.fontSize = '1.8rem';
    title.style.marginBottom = '1rem';
    title.style.fontFamily = "'Press Start 2P', sans-serif";
    menu.appendChild(title);

    // ========== MODE SELECTION ==========

    // Titre section mode
    const modeTitle = document.createElement('h2');
    modeTitle.textContent = 'Select Game Mode';
    modeTitle.style.color = 'black';
    modeTitle.style.textAlign = 'center';
    modeTitle.style.fontSize = '1.2rem';
    modeTitle.style.marginTop = '1rem';
    modeTitle.style.fontFamily = "'Press Start 2P', sans-serif";
    menu.appendChild(modeTitle);

    // Conteneur pour les boutons de mode (horizontal)
    const modeButtonsContainer = document.createElement('div');
    modeButtonsContainer.style.display = 'flex';
    modeButtonsContainer.style.gap = '1rem';
    modeButtonsContainer.style.justifyContent = 'center';

    // Bouton Adventure Mode
    const adventureBtn = document.createElement('button');
    adventureBtn.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🗺️</div>
            <div>ADVENTURE</div>
            <div style="font-size: 0.7rem; margin-top: 0.3rem;">Solo Story Mode</div>
        </div>
    `;
    adventureBtn.style.padding = '1.5rem 1rem';
    adventureBtn.style.border = '3px solid black';
    adventureBtn.style.borderRadius = '10px';
    adventureBtn.style.backgroundColor = '#4CAF50'; // Sélectionné par défaut
    adventureBtn.style.color = 'black';
    adventureBtn.style.cursor = 'pointer';
    adventureBtn.style.fontSize = '1rem';
    adventureBtn.style.fontFamily = "'Press Start 2P', sans-serif";
    adventureBtn.style.width = '180px';
    adventureBtn.style.transition = 'all 0.3s';

    // Bouton VS Mode
    const vsBtn = document.createElement('button');
    vsBtn.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚔️</div>
            <div>VS MODE</div>
            <div style="font-size: 0.7rem; margin-top: 0.3rem;">2-4 Players Battle</div>
        </div>
    `;
    vsBtn.style.padding = '1.5rem 1rem';
    vsBtn.style.border = '3px solid black';
    vsBtn.style.borderRadius = '10px';
    vsBtn.style.backgroundColor = '#4A4A4A'; // Non sélectionné
    vsBtn.style.color = 'white';
    vsBtn.style.cursor = 'pointer';
    vsBtn.style.fontSize = '1rem';
    vsBtn.style.fontFamily = "'Press Start 2P', sans-serif";
    vsBtn.style.width = '180px';
    vsBtn.style.transition = 'all 0.3s';

    // Variable pour tracker le mode sélectionné
    gameInstance.selectedMode = 'adventure';

    // Créer le conteneur de difficulté en avance (sera utilisé après le Start button)
    const difficultyContainer = document.createElement('div');
    difficultyContainer.style.display = 'flex'; // Visible par défaut (mode Adventure)
    difficultyContainer.style.gap = '0.5rem';
    difficultyContainer.style.justifyContent = 'center';
    difficultyContainer.style.flexWrap = 'wrap';

    // Gestion des clics sur les boutons de mode
    adventureBtn.onclick = () => {
        gameInstance.selectedMode = 'adventure';
        adventureBtn.style.backgroundColor = '#4CAF50';
        adventureBtn.style.color = 'black';
        vsBtn.style.backgroundColor = '#4A4A4A';
        vsBtn.style.color = 'white';
        // Afficher difficulté
        difficultyContainer.style.display = 'flex';
        console.log("Mode Adventure sélectionné");
    };

    vsBtn.onclick = () => {
        gameInstance.selectedMode = 'vs';
        vsBtn.style.backgroundColor = '#E74C3C'; // Rouge pour VS
        vsBtn.style.color = 'white';
        adventureBtn.style.backgroundColor = '#4A4A4A';
        adventureBtn.style.color = 'white';
        // Cacher difficulté
        difficultyContainer.style.display = 'none';
        console.log("Mode VS sélectionné");
    };

    // Hover effects
    adventureBtn.onmouseover = () => {
        if (gameInstance.selectedMode !== 'adventure') {
            adventureBtn.style.backgroundColor = '#5CBF60';
        }
    };
    adventureBtn.onmouseout = () => {
        if (gameInstance.selectedMode !== 'adventure') {
            adventureBtn.style.backgroundColor = '#4A4A4A';
        }
    };

    vsBtn.onmouseover = () => {
        if (gameInstance.selectedMode !== 'vs') {
            vsBtn.style.backgroundColor = '#F15C4C';
        }
    };
    vsBtn.onmouseout = () => {
        if (gameInstance.selectedMode !== 'vs') {
            vsBtn.style.backgroundColor = '#4A4A4A';
        }
    };

    modeButtonsContainer.appendChild(adventureBtn);
    modeButtonsContainer.appendChild(vsBtn);
    menu.appendChild(modeButtonsContainer);

    // ========== END MODE SELECTION ==========

    // Séparateur
    const hr = document.createElement('hr');
    hr.style.width = '100%';
    hr.style.margin = '1rem 0';
    menu.appendChild(hr);

    // Bouton Start (modifié pour gérer les 2 modes)
    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start Game';
    startBtn.style.padding = '0.8rem 1.5rem';
    startBtn.style.border = 'none';
    startBtn.style.borderRadius = '5px';
    startBtn.style.backgroundColor = '#4CAF50';
    startBtn.style.color = 'black';
    startBtn.style.cursor = 'pointer';
    startBtn.style.fontSize = '1.2rem';
    startBtn.style.transition = 'background-color 0.3s';
    startBtn.style.fontFamily = "'Press Start 2P', sans-serif";
    startBtn.onmouseover = () => startBtn.style.backgroundColor = '#45a049';
    startBtn.onmouseout = () => startBtn.style.backgroundColor = '#4CAF50';
    // Attach a dynamic onclick handler that checks mode at click time
    startBtn.onclick = () => {
        console.log('[MainMenu] Start clicked - selectedMode:', gameInstance.selectedMode);

        if (gameInstance.selectedMode === 'vs') {
            // Mode VS → Redirection vers lobby
            console.log('[MainMenu] Redirecting to VS lobby...');
            window.location.href = 'views/vs_room_browser.html';
        } else {
            // Mode Adventure → Start game
            console.log('[MainMenu] Adventure mode - checking if game is ready...');

            // Check if game is fully initialized
            if (gameInstance.cutsceneSystem && gameInstance.mapLoader) {
                // Game is ready - start immediately
                console.log('[MainMenu] Game ready - starting now...');
                menuContainer.style.display = 'none';

                if (gameInstance.skipIntro) {
                    console.log('[MainMenu] Skipping intro - loading map1...');
                    gameInstance.mapLoader.loadMap('./assets/maps/map1.json').then(() => {
                        gameInstance.paused = false;
                        const audioSystem = Array.from(gameInstance.systems).find(
                            system => system.constructor.name === 'AudioSystem');
                        if (audioSystem) {
                            audioSystem.startMapMusic(1);
                        }
                    });
                } else {
                    console.log('[MainMenu] Playing intro cutscene...');
                    gameInstance.cutsceneSystem.playCutscene('intro');
                }
            } else {
                // Game not ready - wait for initialization
                console.warn('[MainMenu] Game not ready - waiting for initialization...');
                let checkCount = 0;
                const waitForInit = setInterval(() => {
                    checkCount++;
                    if (gameInstance.cutsceneSystem && gameInstance.mapLoader) {
                        clearInterval(waitForInit);
                        console.log('[MainMenu] Game ready after', checkCount * 100, 'ms - starting...');
                        menuContainer.style.display = 'none';

                        if (gameInstance.skipIntro) {
                            gameInstance.mapLoader.loadMap('./assets/maps/map1.json').then(() => {
                                gameInstance.paused = false;
                                const audioSystem = Array.from(gameInstance.systems).find(
                                    system => system.constructor.name === 'AudioSystem');
                                if (audioSystem) {
                                    audioSystem.startMapMusic(1);
                                }
                            });
                        } else {
                            gameInstance.cutsceneSystem.playCutscene('intro');
                        }
                    }

                    // Timeout after 5 seconds
                    if (checkCount > 50) {
                        clearInterval(waitForInit);
                        console.error('[MainMenu] Timeout waiting for game initialization!');
                    }
                }, 100); // Check every 100ms
            }
        }
    };
    menu.appendChild(startBtn);

    // Bouton Easy (sélectionné par défaut)
    const easyBtn = document.createElement('button');
    easyBtn.textContent = 'Easy';
    easyBtn.style.padding = '0.8rem 1.5rem';
    easyBtn.style.border = 'none';
    easyBtn.style.borderRadius = '5px';
    easyBtn.style.backgroundColor = '#666666'; // Sélectionné
    easyBtn.style.color = 'black';
    easyBtn.style.cursor = 'pointer';
    easyBtn.style.fontSize = '1.2rem';
    easyBtn.style.fontFamily = "'Press Start 2P', sans-serif";

    // Bouton Medium
    const mediumBtn = document.createElement('button');
    mediumBtn.textContent = 'Medium';
    mediumBtn.style.padding = '0.8rem 1.5rem';
    mediumBtn.style.border = 'none';
    mediumBtn.style.borderRadius = '5px';
    mediumBtn.style.backgroundColor = '#4A4A4A';
    mediumBtn.style.color = 'black';
    mediumBtn.style.cursor = 'pointer';
    mediumBtn.style.fontSize = '1.2rem';
    mediumBtn.style.fontFamily = "'Press Start 2P', sans-serif";

    // Bouton Hard
    const hardBtn = document.createElement('button');
    hardBtn.textContent = 'Hard';
    hardBtn.style.padding = '0.8rem 1.5rem';
    hardBtn.style.border = 'none';
    hardBtn.style.borderRadius = '5px';
    hardBtn.style.backgroundColor = '#4A4A4A';
    hardBtn.style.color = 'black';
    hardBtn.style.cursor = 'pointer';
    hardBtn.style.fontSize = '1.2rem';
    hardBtn.style.fontFamily = "'Press Start 2P', sans-serif";

    // Gestion des clics sur les boutons de difficulté
    easyBtn.onclick = () => {
        gameInstance.difficulty = 'easy';
        easyBtn.style.backgroundColor = '#666666';
        mediumBtn.style.backgroundColor = '#4A4A4A';
        hardBtn.style.backgroundColor = '#4A4A4A';
        console.log("Mode facile activé");
    };

    mediumBtn.onclick = () => {
        gameInstance.difficulty = 'medium';
        easyBtn.style.backgroundColor = '#4A4A4A';
        mediumBtn.style.backgroundColor = '#666666';
        hardBtn.style.backgroundColor = '#4A4A4A';
        console.log("Mode moyen activé");
    };

    hardBtn.onclick = () => {
        gameInstance.difficulty = 'hard';
        easyBtn.style.backgroundColor = '#4A4A4A';
        mediumBtn.style.backgroundColor = '#4A4A4A';
        hardBtn.style.backgroundColor = '#666666';
        console.log("Mode difficile activé");
    };

    difficultyContainer.appendChild(easyBtn);
    difficultyContainer.appendChild(mediumBtn);
    difficultyContainer.appendChild(hardBtn);
    menu.appendChild(difficultyContainer);

    // Bouton Options - maintenant fonctionnel
    const optionsBtn = document.createElement('button');
    optionsBtn.textContent = 'Options';
    optionsBtn.style.padding = '0.8rem 1.5rem';
    optionsBtn.style.border = 'none';
    optionsBtn.style.borderRadius = '5px';
    optionsBtn.style.backgroundColor = '#4A4A4A';
    optionsBtn.style.color = 'white';
    optionsBtn.style.cursor = 'pointer';
    optionsBtn.style.fontSize = '1.2rem';
    optionsBtn.style.fontFamily = "'Press Start 2P', sans-serif";

    // Rendre le bouton Options fonctionnel
    optionsBtn.onclick = () => {
        // Créer un conteneur temporaire pour afficher les options
        const optionsContainer = document.createElement('div');
        optionsContainer.style.backgroundColor = 'rgba(176, 159, 119, 0.9)';
        optionsContainer.style.padding = '2rem';
        optionsContainer.style.borderRadius = '10px';
        optionsContainer.style.minWidth = '300px';
        optionsContainer.style.display = 'flex';
        optionsContainer.style.flexDirection = 'column';
        optionsContainer.style.gap = '1rem';

        // Titre options
        const optionsTitle = document.createElement('h2');
        optionsTitle.textContent = 'Options';
        optionsTitle.style.color = 'black';
        optionsTitle.style.textAlign = 'center';
        optionsTitle.style.fontFamily = "'Press Start 2P', sans-serif";
        optionsContainer.appendChild(optionsTitle);

        // Options Audio - même code que dans le menu pause
        const audioOptionsDiv = document.createElement('div');
        audioOptionsDiv.style.width = '100%';
        audioOptionsDiv.style.padding = '10px';

        // Titre de la section audio
        const audioTitle = document.createElement('h4');
        audioTitle.innerHTML = 'Audio Settings';
        audioTitle.style.fontFamily = "'Press Start 2P', sans-serif";
        audioTitle.style.textAlign = 'center';
        audioOptionsDiv.appendChild(audioTitle);

        // Récupérer les paramètres audio par défaut
        let audioSettings = {
            masterVolume: 1.0,
            categories: {
                'sfx': 1.0,
                'music': 0.2,
                'ambient': 0.3
            }
        };

        // Fonction helper pour créer un slider
        function createVolumeSlider(label, category, initialValue) {
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'space-between';
            container.style.margin = '15px 0';

            const labelEl = document.createElement('span');
            labelEl.innerHTML = label;
            labelEl.style.fontFamily = "'Press Start 2P', sans-serif";
            labelEl.style.fontSize = '12px';
            labelEl.style.width = '120px';

            const sliderContainer = document.createElement('div');
            sliderContainer.style.display = 'flex';
            sliderContainer.style.alignItems = 'center';
            sliderContainer.style.flex = '1';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '100';
            slider.value = Math.floor(initialValue * 100);
            slider.style.flex = '1';

            const valueDisplay = document.createElement('span');
            valueDisplay.innerHTML = Math.floor(initialValue * 100) + '%';
            valueDisplay.style.fontFamily = "'Press Start 2P', sans-serif";
            valueDisplay.style.fontSize = '12px';
            valueDisplay.style.width = '50px';
            valueDisplay.style.textAlign = 'right';
            valueDisplay.style.marginLeft = '10px';

            slider.oninput = function () {
                const value = parseInt(this.value) / 100;
                valueDisplay.innerHTML = this.value + '%';

                // Pour le menu initial, nous stockons juste les valeurs
                // Elles seront appliquées quand le système audio sera initialisé
                if (category === 'master') {
                    audioSettings.masterVolume = value;
                } else {
                    audioSettings.categories[category] = value;
                }
            };

            sliderContainer.appendChild(slider);
            sliderContainer.appendChild(valueDisplay);

            container.appendChild(labelEl);
            container.appendChild(sliderContainer);

            return container;
        }

        // Créer les sliders pour chaque catégorie
        audioOptionsDiv.appendChild(createVolumeSlider('Master Volume', 'master', audioSettings.masterVolume));
        audioOptionsDiv.appendChild(createVolumeSlider('Sound Effects', 'sfx', audioSettings.categories.sfx));
        audioOptionsDiv.appendChild(createVolumeSlider('Music', 'music', audioSettings.categories.music));
        audioOptionsDiv.appendChild(createVolumeSlider('Ambient', 'ambient', audioSettings.categories.ambient));

        optionsContainer.appendChild(audioOptionsDiv);

        // Bouton Retour
        const backButton = document.createElement('button');
        backButton.textContent = 'Back';
        backButton.style.padding = '0.8rem 1.5rem';
        backButton.style.border = 'none';
        backButton.style.borderRadius = '5px';
        backButton.style.backgroundColor = '#4A4A4A';
        backButton.style.color = 'white';
        backButton.style.cursor = 'pointer';
        backButton.style.fontSize = '1.2rem';
        backButton.style.fontFamily = "'Press Start 2P', sans-serif";
        backButton.style.margin = '20px auto';
        backButton.style.display = 'block';

        backButton.onclick = () => {
            // Sauvegarder les réglages pour les appliquer plus tard
            gameInstance.audioSettings = audioSettings;
            // Cacher les options et montrer le menu principal
            menu.style.display = 'flex';
            menuContainer.removeChild(optionsContainer);
        };

        optionsContainer.appendChild(backButton);

        // Cacher le menu principal et montrer les options
        menu.style.display = 'none';
        menuContainer.appendChild(optionsContainer);
    };

    menu.appendChild(optionsBtn);

    // Ajouter le menu au conteneur
    menuContainer.appendChild(menu);

    // Ajouter le conteneur au DOM
    container.appendChild(menuContainer);

    return menuContainer;
}