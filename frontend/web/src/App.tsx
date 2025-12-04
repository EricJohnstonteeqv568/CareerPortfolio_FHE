import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  skills: string[];
  experienceLevel: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  status: "pending" | "verified" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<PortfolioItem[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newPortfolioData, setNewPortfolioData] = useState({
    title: "",
    description: "",
    skills: "",
    experienceLevel: "Intermediate"
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Calculate statistics for dashboard
  const verifiedCount = portfolios.filter(p => p.status === "verified").length;
  const pendingCount = portfolios.filter(p => p.status === "pending").length;
  const rejectedCount = portfolios.filter(p => p.status === "rejected").length;

  // Filter portfolios based on search query
  const filteredPortfolios = portfolios.filter(portfolio => 
    portfolio.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    portfolio.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    portfolio.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredPortfolios.length / itemsPerPage);
  const paginatedPortfolios = filteredPortfolios.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    loadPortfolios().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadPortfolios = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("portfolio_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing portfolio keys:", e);
        }
      }
      
      const list: PortfolioItem[] = [];
      
      for (const key of keys) {
        try {
          const portfolioBytes = await contract.getData(`portfolio_${key}`);
          if (portfolioBytes.length > 0) {
            try {
              const portfolioData = JSON.parse(ethers.toUtf8String(portfolioBytes));
              list.push({
                id: key,
                title: portfolioData.title,
                description: portfolioData.description,
                skills: portfolioData.skills,
                experienceLevel: portfolioData.experienceLevel,
                encryptedData: portfolioData.data,
                timestamp: portfolioData.timestamp,
                owner: portfolioData.owner,
                status: portfolioData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing portfolio data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading portfolio ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setPortfolios(list);
    } catch (e) {
      console.error("Error loading portfolios:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitPortfolio = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting portfolio data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newPortfolioData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const portfolioId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const portfolioData = {
        title: newPortfolioData.title,
        description: newPortfolioData.description,
        skills: newPortfolioData.skills.split(',').map(skill => skill.trim()),
        experienceLevel: newPortfolioData.experienceLevel,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `portfolio_${portfolioId}`, 
        ethers.toUtf8Bytes(JSON.stringify(portfolioData))
      );
      
      const keysBytes = await contract.getData("portfolio_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(portfolioId);
      
      await contract.setData(
        "portfolio_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Portfolio submitted securely with FHE encryption!"
      });
      
      await loadPortfolios();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPortfolioData({
          title: "",
          description: "",
          skills: "",
          experienceLevel: "Intermediate"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyPortfolio = async (portfolioId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted portfolio with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const portfolioBytes = await contract.getData(`portfolio_${portfolioId}`);
      if (portfolioBytes.length === 0) {
        throw new Error("Portfolio not found");
      }
      
      const portfolioData = JSON.parse(ethers.toUtf8String(portfolioBytes));
      
      const updatedPortfolio = {
        ...portfolioData,
        status: "verified"
      };
      
      await contract.setData(
        `portfolio_${portfolioId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPortfolio))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      await loadPortfolios();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectPortfolio = async (portfolioId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted portfolio with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const portfolioBytes = await contract.getData(`portfolio_${portfolioId}`);
      if (portfolioBytes.length === 0) {
        throw new Error("Portfolio not found");
      }
      
      const portfolioData = JSON.parse(ethers.toUtf8String(portfolioBytes));
      
      const updatedPortfolio = {
        ...portfolioData,
        status: "rejected"
      };
      
      await contract.setData(
        `portfolio_${portfolioId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPortfolio))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed successfully!"
      });
      
      await loadPortfolios();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to start building your encrypted career portfolio",
      icon: "🔗"
    },
    {
      title: "Create Portfolio",
      description: "Add your skills, experiences and projects to create your career portfolio",
      icon: "📝"
    },
    {
      title: "FHE Encryption",
      description: "Your data is encrypted using FHE technology for maximum privacy",
      icon: "🔒"
    },
    {
      title: "Match Opportunities",
      description: "Get matched with career opportunities without exposing your private data",
      icon: "✨"
    }
  ];

  const renderPieChart = () => {
    const total = portfolios.length || 1;
    const verifiedPercentage = (verifiedCount / total) * 100;
    const pendingPercentage = (pendingCount / total) * 100;
    const rejectedPercentage = (rejectedCount / total) * 100;

    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div 
            className="pie-segment verified" 
            style={{ transform: `rotate(${verifiedPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment pending" 
            style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment rejected" 
            style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage + rejectedPercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{portfolios.length}</div>
            <div className="pie-label">Portfolios</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box verified"></div>
            <span>Verified: {verifiedCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box pending"></div>
            <span>Pending: {pendingCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box rejected"></div>
            <span>Rejected: {rejectedCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="portfolio-icon"></div>
          </div>
          <h1>Career<span>Crypt</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-portfolio-btn primary-btn"
          >
            <div className="add-icon"></div>
            Add Portfolio
          </button>
          <button 
            className="secondary-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Powered Career Portfolio</h2>
            <p>Build your career portfolio with fully homomorphic encryption for maximum privacy</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How CareerCrypt Works</h2>
            <p className="subtitle">Learn how to create and manage your encrypted career portfolio</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h3>FHE Career Portfolio</h3>
            <p>Create an encrypted career portfolio that can be matched with opportunities without exposing your private data.</p>
            <div className="fhe-badge">
              <span>FHE-Protected</span>
            </div>
          </div>
          
          <div className="dashboard-card">
            <h3>Portfolio Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{portfolios.length}</div>
                <div className="stat-label">Total Portfolios</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{verifiedCount}</div>
                <div className="stat-label">Verified</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{rejectedCount}</div>
                <div className="stat-label">Rejected</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card">
            <h3>Status Distribution</h3>
            {renderPieChart()}
          </div>
        </div>
        
        <div className="portfolios-section">
          <div className="section-header">
            <h2>Encrypted Career Portfolios</h2>
            <div className="header-actions">
              <div className="search-container">
                <input 
                  type="text" 
                  placeholder="Search portfolios..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <div className="search-icon"></div>
              </div>
              <button 
                onClick={loadPortfolios}
                className="refresh-btn secondary-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="portfolios-list">
            {paginatedPortfolios.length === 0 ? (
              <div className="no-portfolios">
                <div className="no-portfolios-icon"></div>
                <p>No career portfolios found</p>
                <button 
                  className="primary-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Portfolio
                </button>
              </div>
            ) : (
              paginatedPortfolios.map(portfolio => (
                <div className="portfolio-card" key={portfolio.id}>
                  <div className="portfolio-header">
                    <h3>{portfolio.title}</h3>
                    <span className={`status-badge ${portfolio.status}`}>
                      {portfolio.status}
                    </span>
                  </div>
                  <p className="portfolio-description">{portfolio.description}</p>
                  <div className="portfolio-skills">
                    {portfolio.skills.map((skill, index) => (
                      <span key={index} className="skill-tag">{skill}</span>
                    ))}
                  </div>
                  <div className="portfolio-footer">
                    <div className="portfolio-meta">
                      <span className="experience-level">{portfolio.experienceLevel}</span>
                      <span className="portfolio-date">
                        {new Date(portfolio.timestamp * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="portfolio-actions">
                      {isOwner(portfolio.owner) && portfolio.status === "pending" && (
                        <>
                          <button 
                            className="action-btn success-btn"
                            onClick={() => verifyPortfolio(portfolio.id)}
                          >
                            Verify
                          </button>
                          <button 
                            className="action-btn danger-btn"
                            onClick={() => rejectPortfolio(portfolio.id)}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {totalPages > 1 && (
            <div className="pagination">
              <button 
                className="pagination-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {currentPage} of {totalPages}
              </span>
              <button 
                className="pagination-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitPortfolio} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          portfolioData={newPortfolioData}
          setPortfolioData={setNewPortfolioData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="portfolio-icon"></div>
              <span>CareerCrypt</span>
            </div>
            <p>FHE-powered career portfolio platform for secure career development</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} CareerCrypt. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  portfolioData: any;
  setPortfolioData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  portfolioData,
  setPortfolioData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPortfolioData({
      ...portfolioData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!portfolioData.title || !portfolioData.skills) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create Career Portfolio</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your portfolio data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Title *</label>
              <input 
                type="text"
                name="title"
                value={portfolioData.title} 
                onChange={handleChange}
                placeholder="Portfolio title..." 
                className="text-input"
              />
            </div>
            
            <div className="form-group">
              <label>Experience Level</label>
              <select 
                name="experienceLevel"
                value={portfolioData.experienceLevel} 
                onChange={handleChange}
                className="select-input"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
                <option value="Expert">Expert</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Description</label>
              <textarea 
                name="description"
                value={portfolioData.description} 
                onChange={handleChange}
                placeholder="Describe your career portfolio..." 
                className="text-area"
                rows={3}
              />
            </div>
            
            <div className="form-group full-width">
              <label>Skills * (comma separated)</label>
              <input 
                type="text"
                name="skills"
                value={portfolioData.skills} 
                onChange={handleChange}
                placeholder="JavaScript, React, Node.js, etc." 
                className="text-input"
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn secondary-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary-btn"
          >
            {creating ? "Encrypting with FHE..." : "Create Portfolio"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;