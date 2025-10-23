class HalloweenGame {
    constructor() {
        this.web3 = null;
        this.account = null;
        this.contract = null;
        this.score = 0;
        this.highScore = 0;
        this.attempts = 0;
        this.maxAttempts = 5;
        this.gameActive = false;
        this.totalGames = 0;
        
        // Contract details - UPDATE THIS AFTER DEPLOYING CONTRACT
        this.contractAddress = "0x0000000000000000000000000000000000000000";
        this.contractABI = [
            {
                "inputs": [{"internalType": "uint256", "name": "_score", "type": "uint256"}],
                "name": "submitScore",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "getLeaderboard",
                "outputs": [
                    {"internalType": "address[]", "name": "", "type": "address[]"},
                    {"internalType": "uint256[]", "name": "", "type": "uint256[]"}
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [{"internalType": "address", "name": "_player", "type": "address"}],
                "name": "getPlayerScore",
                "outputs": [
                    {"internalType": "uint256", "name": "highScore", "type": "uint256"},
                    {"internalType": "uint256", "name": "totalGames", "type": "uint256"},
                    {"internalType": "uint256", "name": "lastPlayed", "type": "uint256"}
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "gameFee",
                "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function"
            }
        ];
        
        this.init();
    }

    async init() {
        console.log("🎮 Initializing Halloween Game...");
        
        // Check if Web3 is available (MetaMask)
        if (typeof window.ethereum !== 'undefined') {
            this.web3 = new Web3(window.ethereum);
            console.log("✅ Web3 detected");
        } else {
            this.showError("⚠️ Please install MetaMask to play this game!");
            return;
        }

        this.setupEventListeners();
        this.loadLeaderboard();
        
        // Try auto-connect if previously connected
        try {
            const accounts = await this.web3.eth.getAccounts();
            if (accounts.length > 0) {
                this.account = accounts[0];
                this.showWalletInfo();
                this.showGameSection();
                await this.loadPlayerData();
                console.log("🔗 Auto-connected to wallet:", this.account);
            }
        } catch (error) {
            console.log("No auto-connection available");
        }
    }

    setupEventListeners() {
        // Wallet connection
        document.getElementById('connect-wallet').addEventListener('click', () => this.connectWallet());
        
        // Game controls
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('collect-reward').addEventListener('click', () => this.collectReward());
        document.getElementById('submit-score').addEventListener('click', () => this.submitScore());
        
        // Pumpkin click events
        document.querySelectorAll('.pumpkin').forEach(pumpkin => {
            pumpkin.addEventListener('click', (e) => this.selectPumpkin(e.target.id));
        });

        // Listen for account changes in MetaMask
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    // User disconnected wallet
                    this.account = null;
                    this.hideGameSection();
                    this.showMessage("Wallet disconnected", "warning");
                } else {
                    // User switched accounts
                    this.account = accounts[0];
                    this.showWalletInfo();
                    this.loadPlayerData();
                    this.showMessage("Wallet switched successfully", "success");
                }
            });

            // Listen for network changes
            window.ethereum.on('chainChanged', (chainId) => {
                window.location.reload();
            });
        }
    }

    async connectWallet() {
        try {
            console.log("🔗 Connecting wallet...");
            this.showMessage("Connecting to MetaMask...", "info");
            
            // Request account access
            const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
            
            this.account = accounts[0];
            console.log("✅ Wallet connected:", this.account);
            
            this.showWalletInfo();
            this.showGameSection();
            
            // Check and switch to Somnia network if needed
            await this.checkNetwork();
            
            // Load player data from blockchain
            await this.loadPlayerData();
            
            this.showMessage("Wallet connected successfully!", "success");
            
        } catch (error) {
            console.error('❌ Error connecting wallet:', error);
            if (error.code === 4001) {
                this.showError("Wallet connection rejected by user");
            } else {
                this.showError('Error connecting wallet: ' + error.message);
            }
        }
    }

    async checkNetwork() {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const somniaChainId = '0xc498'; // 50312 in hexadecimal
        
        if (chainId !== somniaChainId) {
            this.showMessage("Switching to Somnia Testnet...", "warning");
            const switchSuccess = await this.switchToSomniaNetwork();
            if (!switchSuccess) {
                this.showError('Please switch to Somnia Testnet in MetaMask to play the game');
            } else {
                this.showMessage("Successfully switched to Somnia Testnet", "success");
            }
        } else {
            console.log("✅ Correct network: Somnia Testnet");
            document.getElementById('network-info').textContent = "Somnia Testnet ✅";
        }
    }

    async switchToSomniaNetwork() {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0xc498' }],
            });
            return true;
        } catch (error) {
            if (error.code === 4902) {
                // Network not added, so add it
                return await this.addSomniaNetwork();
            }
            return false;
        }
    }

    async addSomniaNetwork() {
        try {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: '0xc498',
                    chainName: 'Somnia Testnet',
                    rpcUrls: ['https://dream-rpc.somnia.network/'],
                    nativeCurrency: {
                        name: 'Somnia Test Token',
                        symbol: 'STT',
                        decimals: 18
                    },
                    blockExplorerUrls: ['https://shannon-explorer.somnia.network/']
                }]
            });
            return true;
        } catch (error) {
            console.error('Error adding network:', error);
            return false;
        }
    }

    async loadPlayerData() {
        if (!this.account || !this.contract) return;
        
        try {
            // Load player's high score and game history from contract
            const playerData = await this.contract.methods.getPlayerScore(this.account).call();
            this.highScore = parseInt(playerData.highScore);
            this.totalGames = parseInt(playerData.totalGames);
            
            this.updatePlayerUI();
            
        } catch (error) {
            console.log("No player data found or contract not deployed");
        }
    }

    showWalletInfo() {
        const walletInfo = document.getElementById('wallet-info');
        const walletAddress = document.getElementById('wallet-address');
        
        // Shorten address for display: 0x742d...35a
        const shortAddress = this.account.substring(0, 6) + '...' + this.account.substring(38);
        walletAddress.textContent = shortAddress;
        walletInfo.classList.remove('hidden');
        
        // Update button text
        document.getElementById('connect-wallet').textContent = '🔗 Wallet Connected';
        document.getElementById('connect-wallet').style.background = 'linear-gradient(45deg, #4ecdc4, #44a08d)';
    }

    showGameSection() {
        document.getElementById('game-section').classList.remove('hidden');
    }

    hideGameSection() {
        document.getElementById('game-section').classList.add('hidden');
        document.getElementById('connect-wallet').textContent = 'Connect MetaMask';
        document.getElementById('connect-wallet').style.background = 'linear-gradient(45deg, #ff6b6b, #ff9e44)';
    }

    startGame() {
        if (this.attempts >= this.maxAttempts) {
            this.showError('❌ Maximum attempts reached! Submit your score to blockchain.');
            return;
        }

        this.gameActive = true;
        this.score = 0;
        
        // Update UI state
        document.getElementById('start-game').classList.add('hidden');
        document.getElementById('collect-reward').classList.add('hidden');
        document.getElementById('submit-score').classList.add('hidden');
        
        this.showMessage('🎯 Choose a pumpkin! Find treasures... or ghosts!', 'info');
        
        // Reset pumpkin appearances
        document.querySelectorAll('.pumpkin').forEach(pumpkin => {
            pumpkin.classList.remove('selected');
            pumpkin.style.opacity = '1';
            pumpkin.style.transform = 'scale(1)';
        });
        
        this.updateUI();
    }

    selectPumpkin(pumpkinId) {
        if (!this.gameActive) return;

        const pumpkin = document.getElementById(pumpkinId);
        const allPumpkins = document.querySelectorAll('.pumpkin');
        
        // Deselect all other pumpkins and select clicked one
        allPumpkins.forEach(p => p.classList.remove('selected'));
        pumpkin.classList.add('selected');

        // Define possible game outcomes
        const outcomes = [
            { 
                type: 'reward', 
                message: '🎉 CONGRATULATIONS! You found 100 STT!', 
                points: 100
            },
            { 
                type: 'reward', 
                message: '💰 Hidden treasure discovered! +50 points', 
                points: 50
            },
            { 
                type: 'ghost', 
                message: '👻 BOO! A ghost scared you! -30 points', 
                points: -30
            },
            { 
                type: 'trap', 
                message: '🕸️ Caught in spider web! -20 points', 
                points: -20
            },
            { 
                type: 'bonus', 
                message: '🍬 Halloween candy bonus! +80 points', 
                points: 80
            },
            { 
                type: 'jackpot', 
                message: '🎰 JACKPOT! +150 points!!!', 
                points: 150
            },
            { 
                type: 'curse', 
                message: '⚡ Ancient curse! -40 points', 
                points: -40
            },
            { 
                type: 'magic', 
                message: '✨ Magic spell! +120 points', 
                points: 120
            }
        ];

        // Randomly select an outcome
        const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        
        // Update score
        this.score += outcome.points;
        this.score = Math.max(0, this.score); // Prevent negative scores
        this.attempts++;
        
        // Show outcome message
        this.showMessage(outcome.message, outcome.type);
        this.updateUI();

        // Visual effects for negative outcomes
        if (outcome.type === 'ghost' || outcome.type === 'trap' || outcome.type === 'curse') {
            pumpkin.style.opacity = '0.6';
            pumpkin.style.transform = 'scale(0.9)';
            pumpkin.classList.add('spooky-animation');
        }

        // End game round
        this.gameActive = false;
        
        // Show appropriate button based on attempts
        if (this.attempts < this.maxAttempts) {
            document.getElementById('collect-reward').classList.remove('hidden');
        } else {
            document.getElementById('submit-score').classList.remove('hidden');
            this.showMessage('🎊 Game completed! Submit your score to the blockchain.', 'success');
        }
    }

    collectReward() {
        this.showMessage(`💰 Current score: ${this.score} points. Ready for next round?`, 'info');
        document.getElementById('start-game').classList.remove('hidden');
        document.getElementById('collect-reward').classList.add('hidden');
    }

    async submitScore() {
        try {
            this.showMessage('📡 Submitting score to blockchain...', 'info');
            
            // Simulate blockchain transaction
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Update high score if current score is higher
            if (this.score > this.highScore) {
                this.highScore = this.score;
            }
            
            this.totalGames++;
            this.attempts = 0; // Reset attempts for new game session
            
            this.showMessage(`✅ Score ${this.score} successfully submitted to blockchain!`, 'success');
            
            // Update UI
            document.getElementById('start-game').classList.remove('hidden');
            document.getElementById('submit-score').classList.add('hidden');
            
            // Reload leaderboard
            this.loadLeaderboard();
            this.updatePlayerUI();
            
        } catch (error) {
            console.error('Error submitting score:', error);
            this.showError('❌ Failed to submit score. Please try again.');
        }
    }

    showMessage(message, type = 'info') {
        const statusElement = document.getElementById('game-status');
        statusElement.textContent = message;
        
        // Remove all previous classes
        statusElement.classList.remove('success', 'error', 'warning');
        
        // Add appropriate class based on type
        if (type === 'success') {
            statusElement.classList.add('success');
        } else if (type === 'error' || type === 'ghost' || type === 'trap' || type === 'curse') {
            statusElement.classList.add('error');
        } else if (type === 'warning') {
            statusElement.classList.add('warning');
        }
        
        // Add pulse animation
        statusElement.classList.add('pulse');
        setTimeout(() => statusElement.classList.remove('pulse'), 500);
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    updateUI() {
        document.getElementById('current-score').textContent = this.score;
        document.getElementById('attempts').textContent = this.attempts;
        document.getElementById('high-score').textContent = this.highScore;
    }

    updatePlayerUI() {
        document.getElementById('user-high-score').textContent = this.highScore;
        document.getElementById('total-games').textContent = this.totalGames;
        document.getElementById('contract-address').textContent = this.contractAddress !== "0x0000000000000000000000000000000000000000" 
            ? this.contractAddress.substring(0, 8) + '...' + this.contractAddress.substring(36)
            : 'Not deployed';
    }

    async loadLeaderboard() {
        const leaderboardElement = document.getElementById('leaderboard');
        
        try {
            // Simulated leaderboard data
            // In real implementation, this would come from the smart contract
            const mockLeaderboard = [
                { address: '0x742d35a...d35a', score: 450, rank: 1 },
                { address: '0x8a3f2b1...f2b1', score: 380, rank: 2 },
                { address: '0x1c9e7d4...e7d4', score: 320, rank: 3 },
                { address: '0x5b6a8c3...a8c3', score: 290, rank: 4 },
                { address: '0x3d2b9e1...b9e1', score: 250, rank: 5 },
                { address: '0x9f4a7c2...7c2d', score: 220, rank: 6 },
                { address: '0x2e8b1d4...1d4a', score: 190, rank: 7 }
            ];

            leaderboardElement.innerHTML = mockLeaderboard
                .map(player => `
                    <div class="leaderboard-item">
                        <span>#${player.rank} ${player.address}</span>
                        <span>${player.score} points</span>
                    </div>
                `).join('');
                
        } catch (error) {
            leaderboardElement.innerHTML = '<div class="loading">Error loading leaderboard</div>';
        }
    }
}

// Initialize the game when the page loads
window.addEventListener('load', () => {
    console.log("🚀 Starting Halloween Pumpkin Game...");
    new HalloweenGame();
});

// Add some spooky effects for Halloween theme
document.addEventListener('DOMContentLoaded', function() {
    // Add occasional spooky sound effects (commented out for now)
    /*
    const spookySounds = [
        'https://assets.mixkit.co/sfx/preview/mixkit-creepy-laugh-424.mp3',
        'https://assets.mixkit.co/sfx/preview/mixkit-horror-baby-laugh-483.mp3'
    ];
    */
    
    console.log("🎃 Welcome to Pumpkin Somnia Network! Ready for spooky adventures?");
});
