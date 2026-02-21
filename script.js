// ==========================================
// BLOC DE SYNCHRONISATION (POLLING + RATIOS)
// ==========================================
let enTrainDeSynchroniser = false;
let derniereSynchroLocale = 0;

// 1. FONCTION D'ENVOI (Sauvegarde)
async function synchroniserCloud() {
  if (!window.db) return;
  enTrainDeSynchroniser = true;
  const maintenant = Date.now();
  derniereSynchroLocale = maintenant;

  try {
    const dataToSave = {
      historique: historiquePatrimoine,
      bocauxData: bocaux, // Les ratios xRatio et yRatio sont inclus ici
      updatedAt: maintenant
    };
    // On écrit dans la base de données
    await window.fbSetDoc(window.fbDoc(window.db, "donnees", "monPatrimoine"), dataToSave);
    console.log("💾 Sauvegardé Cloud");
  } catch (e) { console.error("Erreur Cloud:", e); }
  
  // On relâche le verrou après 2 secondes
  setTimeout(() => { enTrainDeSynchroniser = false; }, 2000);
}

// 2. FONCTION DE RÉCEPTION (Chargement toutes les 4s)
async function chargerDepuisCloud() {
  // Si on est en train d'écrire ou si DB pas prête, on attend
  if (!window.db || enTrainDeSynchroniser) { 
    setTimeout(chargerDepuisCloud, 4000); 
    return; 
  }

  try {
    // On va chercher le document manuellement (pas de RealTime)
    const docSnap = await window.fbGetDoc(window.fbDoc(window.db, "donnees", "monPatrimoine"));
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const updatedAtCloud = data.updatedAt || 0;

      // Si le Cloud est plus récent que notre version locale
      if (updatedAtCloud > derniereSynchroLocale) {
        console.log("📥 Nouvelle version détectée, mise à jour...");
        
        bocaux = data.bocauxData || [];
        localStorage.setItem("bocaux", JSON.stringify(bocaux));
        historiquePatrimoine = data.historique || [];
        localStorage.setItem("historiquePatrimoine", JSON.stringify(historiquePatrimoine));

        // --- REDESSINER LE TERRAIN (AVEC RATIOS) ---
        const land = document.getElementById("land");
        land.innerHTML = ""; // On vide tout
        // Si tu as une grille, on la remet (optionnel)
        if (typeof gridOverlay !== 'undefined' && gridOverlay) land.appendChild(gridOverlay);
        
        bocaux.forEach(item => {
          // C'est ICI que la magie opère pour le mobile : on passe les xRatio/yRatio
          creerBocal(
            item.nom, item.volume, item.capital, item.objectif, item.simulation, 
            item.left, item.top, item.zIndex, item.anchored, item.id, 
            item.investment, item.interest, true, item.categorie, item.composition,
            item.xRatio, item.yRatio // <--- Important pour la proportionnalité
          );
        });

        if (typeof updateTotalPatrimoine === "function") updateTotalPatrimoine();
        derniereSynchroLocale = updatedAtCloud;
      }
    }
  } catch (e) {
    console.error("Erreur lecture Cloud:", e);
  }

  // On relance la vérification dans 4 secondes (Boucle infinie)
  setTimeout(chargerDepuisCloud, 4000);
}

// Lancement de la boucle au démarrage
window.addEventListener('load', function() {
    // Petit délai pour laisser Firebase s'initialiser
    setTimeout(chargerDepuisCloud, 1000);
});

// ========================================
// LOGIQUE DE SAUVEGARDE ET CALCULS
// ========================================

function saveBocaux() {
  localStorage.setItem("bocaux", JSON.stringify(bocaux));
  updateTotalPatrimoine();
  updateTotalPatrimoineVise();
  updateTotalPatrimoineSimule();
  // IMPORTANT : On synchronise dès qu'on sauvegarde
  synchroniserCloud(); 
}

function sauvegarderHistorique() {
  localStorage.setItem("historiquePatrimoine", JSON.stringify(historiquePatrimoine));
  synchroniserCloud();
}  

  // On vérifie toutes les 10 secondes (plus calme pour le mobile)
  setTimeout(chargerDepuisCloud, 10000); 

// Lancement initial
setTimeout(chargerDepuisCloud, 2000);

// ========================================
// SYSTÈME DE GRAPHIQUE
// ========================================

const graphiqueBtn = document.getElementById("graphiqueBtn");
const graphiqueFenetre = document.getElementById("graphiqueFenetre");
const graphiqueCloseBtn = document.getElementById("graphiqueCloseBtn");
const enregistrerPointBtn = document.getElementById("enregistrerPointBtn");
const effacerHistoriqueBtn = document.getElementById("effacerHistoriqueBtn");
const graphiqueCanvas = document.getElementById("graphiqueCanvas");
const ctx = graphiqueCanvas.getContext("2d");
const supprimerDernierPointBtn = document.getElementById("supprimerDernierPointBtn");

// Historique du patrimoine
let historiquePatrimoine = [];

// Charger l'historique depuis localStorage
function chargerHistorique() {
  const saved = localStorage.getItem("historiquePatrimoine");
  if (saved) {
    try {
      historiquePatrimoine = JSON.parse(saved);
    } catch (e) {
      console.error("Erreur chargement historique:", e);
      historiquePatrimoine = [];
    }
  }
}

// Sauvegarder l'historique dans localStorage
function sauvegarderHistorique() {
  localStorage.setItem("historiquePatrimoine", JSON.stringify(historiquePatrimoine));
  synchroniserCloud();
}

// Enregistrer un point dans l'historique
function enregistrerPoint() {
  const total = bocaux.reduce(function(s, b) {
    let capital = 0;
    
    if (b.categorie === "Goutte") {
      if (b.composition) {
        Object.keys(b.composition).forEach(function(label) {
          const qty = b.composition[label] || 0;
          const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
          if (valInfo) {
            capital += qty * valInfo.value;
          }
        });
      }
    } else if (b.categorie === "Fuite") {
      capital = Number(b.investment) || 0;
    } else {
      const inv = Number(b.investment) || 0;
      const intr = Number(b.interest) || 0;
      capital = inv + intr;
    }
    
    return s + capital;
  }, 0);

  historiquePatrimoine.push({
    timestamp: Date.now(),
    valeur: formatNumber(total)
  });

  sauvegarderHistorique();
  
  // Afficher une notification
  showNotification("Point enregistré avec succès!");
}

// Fonction pour afficher une notification
function showNotification(message) {
  const notif = document.createElement("div");
  notif.textContent = message;
  Object.assign(notif.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#2ecc71",
    color: "white",
    padding: "12px 24px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    zIndex: 40000,
    fontSize: "14px",
    fontWeight: "bold"
  });
  document.body.appendChild(notif);
  
  setTimeout(function() {
    notif.style.opacity = "0";
    notif.style.transition = "opacity 0.3s";
    setTimeout(function() { notif.remove(); }, 300);
  }, 2000);
}

// Effacer l'historique
function effacerHistorique() {
  if (confirm("Êtes-vous sûr de vouloir effacer tout l'historique ? Cette action est irréversible.")) {
    historiquePatrimoine = [];
    sauvegarderHistorique();
    dessinerGraphique();
    showNotification("Historique effacé");
  }
}

// Supprimer le dernier point
function supprimerDernierPoint() {
  if (historiquePatrimoine.length === 0) {
    showNotification("Aucun point à supprimer");
    return;
  }
  
  if (confirm("Êtes-vous sûr de vouloir supprimer le dernier point enregistré ?")) {
    historiquePatrimoine.pop();
    sauvegarderHistorique();
    dessinerGraphique();
    showNotification("Dernier point supprimé");
  }
}

// Utiliser tout l'historique
function filtrerDonnees() {
  return historiquePatrimoine;
}

// Dessiner le graphique
function dessinerGraphique() {
  const donnees = filtrerDonnees();
  
  // Redimensionner le canvas
  const container = document.getElementById("graphiqueContainer");
  graphiqueCanvas.width = container.clientWidth;
  graphiqueCanvas.height = container.clientHeight;
  
  const width = graphiqueCanvas.width;
  const height = graphiqueCanvas.height;
  
  // Effacer le canvas
  ctx.clearRect(0, 0, width, height);
  
  if (donnees.length === 0) {
    // Afficher un message si pas de données
    ctx.fillStyle = "#999";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Aucune donnée disponible", width / 2, height / 2);
    ctx.fillText("Cliquez sur 'Enregistrer point actuel' pour commencer", width / 2, height / 2 + 25);
    
    // Mettre à jour les stats
    document.getElementById("statActuel").textContent = "0 €";
    document.getElementById("statPoints").textContent = "0";
    document.getElementById("statMax").textContent = "0 €";
    document.getElementById("statMin").textContent = "0 €";
    
    const progressionEl = document.getElementById("statProgression");
    progressionEl.textContent = "0%";
    progressionEl.className = "stat-value";
    progressionEl.style.color = "#000";
    
    document.getElementById("statEvolution").textContent = "0 €";
    return;
  }
  
  // Marges
  const margin = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  // Trouver min et max
  const valeurs = donnees.map(function(d) { return d.valeur; });
  const minVal = Math.min.apply(null, valeurs);
  const maxVal = Math.max.apply(null, valeurs);
  const range = maxVal - minVal;
  const padding = range * 0.1; // 10% de padding
  
  const yMin = minVal - padding;
  const yMax = maxVal + padding;
  
  // Échelles
  function scaleX(index) {
    return margin.left + (index / (donnees.length - 1)) * chartWidth;
  }
  
  function scaleY(valeur) {
    return margin.top + chartHeight - ((valeur - yMin) / (yMax - yMin)) * chartHeight;
  }
  
  // Dessiner la grille
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  
  // Grille horizontale (5 lignes)
  for (let i = 0; i <= 5; i++) {
    const y = margin.top + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartWidth, y);
    ctx.stroke();
    
    // Labels Y - arrondi intelligent basé sur les puissances de 10
const valeur = yMax - ((yMax - yMin) / 5) * i;
let valeurArrondie = 0;

// Calculer l'ordre de grandeur
const amplitude = yMax - yMin;
if (amplitude === 0) {
    valeurArrondie = valeur;
} else {
    // Déterminer la puissance de 10 adaptée
    const puissance = Math.floor(Math.log10(amplitude));
    let pas = 1;
    
    if (puissance >= 0) {
        pas = Math.pow(10, puissance - 1); // Pas plus fin pour plus de précision
        if (pas < 1) pas = 1;
    }
    
    // S'assurer que le pas est "propre" (1, 2, 5, 10, 20, 50, etc.)
    if (pas > 50) pas = Math.round(pas / 10) * 10;
    else if (pas > 5) pas = Math.round(pas);
    
    valeurArrondie = Math.round(valeur / pas) * pas;
}

ctx.fillStyle = "#666";
ctx.font = "12px Arial";
ctx.textAlign = "right";
ctx.fillText(formatMoney(valeurArrondie), margin.left - 10, y + 4);
  }
  
  // Grille verticale (labels de dates)
  const nbLabels = Math.min(5, donnees.length);
  for (let i = 0; i < nbLabels; i++) {
    const index = Math.floor((donnees.length - 1) * i / (nbLabels - 1));
    const x = scaleX(index);
    
    ctx.strokeStyle = "#e0e0e0";
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + chartHeight);
    ctx.stroke();
    
    // Label date
    const date = new Date(donnees[index].timestamp);
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    ctx.fillStyle = "#666";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(dateStr, x, height - margin.bottom + 20);
  }
  
  // Dessiner la ligne
  ctx.strokeStyle = "#667eea";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  
  ctx.beginPath();
  donnees.forEach(function(point, index) {
    const x = scaleX(index);
    const y = scaleY(point.valeur);
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  
  // Remplir sous la courbe avec un dégradé
  const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
  gradient.addColorStop(0, "rgba(102, 126, 234, 0.3)");
  gradient.addColorStop(1, "rgba(102, 126, 234, 0.0)");
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  donnees.forEach(function(point, index) {
    const x = scaleX(index);
    const y = scaleY(point.valeur);
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.lineTo(scaleX(donnees.length - 1), margin.top + chartHeight);
  ctx.lineTo(scaleX(0), margin.top + chartHeight);
  ctx.closePath();
  ctx.fill();
  
  // Dessiner les points avec tooltip
  ctx.fillStyle = "#667eea";
  
  // Variable pour stocker le tooltip
  let tooltipDiv = document.getElementById("graphiqueTooltip");
  if (!tooltipDiv) {
    tooltipDiv = document.createElement("div");
    tooltipDiv.id = "graphiqueTooltip";
    Object.assign(tooltipDiv.style, {
      position: "absolute",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      color: "white",
      padding: "8px 12px",
      borderRadius: "6px",
      fontSize: "12px",
      pointerEvents: "none",
      display: "none",
      zIndex: 40000,
      whiteSpace: "nowrap"
    });
    document.body.appendChild(tooltipDiv);
  }
  
  // Écouteur de mouvement de souris sur le canvas
  graphiqueCanvas.onmousemove = function(e) {
    const rect = graphiqueCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    let found = false;
    donnees.forEach(function(point, index) {
      const x = scaleX(index);
      const y = scaleY(point.valeur);
      
      const distance = Math.sqrt(Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2));
      
      if (distance < 8) {
        found = true;
        const date = new Date(point.timestamp);
        const dateStr = date.toLocaleDateString('fr-FR', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        tooltipDiv.innerHTML = dateStr + "<br><strong>" + formatMoney(point.valeur) + "</strong>";
        tooltipDiv.style.display = "block";
        tooltipDiv.style.left = (e.clientX + 10) + "px";
        tooltipDiv.style.top = (e.clientY - 40) + "px";
      }
    });
    
    if (!found) {
      tooltipDiv.style.display = "none";
    }
  };
  
  graphiqueCanvas.onmouseleave = function() {
    tooltipDiv.style.display = "none";
  };
  
  donnees.forEach(function(point, index) {
    const x = scaleX(index);
    const y = scaleY(point.valeur);
    
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Point spécial pour le dernier (plus gros)
    if (index === donnees.length - 1) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#764ba2";
      ctx.fill();
    }
  });
  
  // Mettre à jour les statistiques
  const actuel = donnees[donnees.length - 1].valeur;
  const premier = donnees[0].valeur;
  const evolution = actuel - premier;
  
  // Calculer le patrimoine visé
  const patrimoineVise = bocaux.reduce(function(s, b) {
    return s + (formatNumber(b.objectif) || 0);
  }, 0);
  
  // Calculer le pourcentage de progression
  let progression = 0;
  if (patrimoineVise > 0) {
    progression = (actuel / patrimoineVise) * 100;
  }
  
  document.getElementById("statActuel").textContent = formatMoney(actuel);
  document.getElementById("statPoints").textContent = donnees.length.toString();
  document.getElementById("statMax").textContent = formatMoney(maxVal);
  document.getElementById("statMin").textContent = formatMoney(minVal);
  
  const progressionEl = document.getElementById("statProgression");
  progressionEl.textContent = progression.toFixed(1) + "%";
  if (progression >= 100) {
    progressionEl.className = "stat-value positive";
  } else if (progression >= 75) {
    progressionEl.className = "stat-value";
    progressionEl.style.color = "#f39c12";
  } else {
    progressionEl.className = "stat-value";
    progressionEl.style.color = "#000";
  }
  
  const evolutionEl = document.getElementById("statEvolution");
  evolutionEl.textContent = (evolution >= 0 ? "+" : "") + formatMoney(evolution);
  evolutionEl.className = "stat-value " + (evolution >= 0 ? "positive" : "negative");
}

// Ouvrir la fenêtre du graphique
graphiqueBtn.addEventListener("click", function() {
  graphiqueFenetre.style.display = "flex";
  setTimeout(function() {
    dessinerGraphique();
  }, 50);
});

// Fermer la fenêtre du graphique
graphiqueCloseBtn.addEventListener("click", function() {
  graphiqueFenetre.style.display = "none";
});

// Enregistrer un point
enregistrerPointBtn.addEventListener("click", function() {
  enregistrerPoint();
  dessinerGraphique();
});

// Effacer l'historique
effacerHistoriqueBtn.addEventListener("click", function() {
  effacerHistorique();
});

// Supprimer le dernier point
supprimerDernierPointBtn.addEventListener("click", function() {
  supprimerDernierPoint();
});

// Redessiner lors du redimensionnement
window.addEventListener("resize", function() {
  if (graphiqueFenetre.style.display === "flex") {
    dessinerGraphique();
  }
});

// Charger l'historique au démarrage
chargerHistorique();

// ========================================
// FIN DU SYSTÈME DE GRAPHIQUE
// ========================================

// Fonction pour formater les valeurs monétaires
function formatMoney(value) {
  const numberValue = parseFloat(value);
  if (isNaN(numberValue)) return "0 €";
  
  // Arrondir au centième
  const rounded = Math.round(numberValue * 100) / 100;
  
  // Vérifier si c'est un entier (pas de centimes)
  if (rounded % 1 === 0) {
    return Math.round(rounded) + " €";
  } else {
    return rounded.toFixed(2) + " €";
  }
}

// Fonction pour formater les valeurs sans le symbole € (pour les calculs)
function formatNumber(value) {
  const numberValue = parseFloat(value);
  if (isNaN(numberValue)) return 0;
  
  // Arrondir au centième
  const rounded = Math.round(numberValue * 100) / 100;
  
  // Vérifier si c'est un entier (pas de centimes)
  if (rounded % 1 === 0) {
    return Math.round(rounded);
  } else {
    return parseFloat(rounded.toFixed(2));
  }
}

// Fonction pour recalculer les totaux d'une Goutte (billets et pièces)
function recalcGoutteTotals(bocalId) {
  const idx = bocaux.findIndex(function(b) { return b.id === bocalId; });
  if (idx === -1) return;
  
  let totalBillets = 0;
  let totalPieces = 0;
  const composition = bocaux[idx].composition || {};
  
  Object.keys(composition).forEach(function(label) {
    const qty = composition[label] || 0;
    const valInfo = monnaieValues.flatMap(function(g) { 
      return g.values; 
    }).find(function(v) { 
      return v.label === label; 
    });
    
    if (valInfo) {
      const montant = qty * valInfo.value;
      if (label === "5€" || label === "10€" || label === "20€" || label === "50€") {
        totalBillets += montant;
      } else {
        totalPieces += montant;
      }
    }
  });
  
  bocaux[idx].investment = formatNumber(totalBillets);
  bocaux[idx].interest = formatNumber(totalPieces);
  
  // Mettre à jour le bocal DOM
  const bocalElem = bocalMap.get(bocalId);
  if (bocalElem) {
    bocalElem._investment = formatNumber(totalBillets);
    bocalElem._interest = formatNumber(totalPieces);
  }
  
  return { totalBillets, totalPieces };
}

// Fonction pour ajuster la position du menu contextuel dans le land
function ajusterPositionMenu(bocal) {
  if (!menuContextuel._targetBocal || menuContextuel.style.display !== "block") return;
  
  const rect = bocal.getBoundingClientRect();
  const landRect = land.getBoundingClientRect();
  const menuRect = menuContextuel.getBoundingClientRect();
  
  // Position actuelle
  let top = parseFloat(menuContextuel.style.top) || 0;
  let left = parseFloat(menuContextuel.style.left) || 0;
  
  // Vérifier si le menu est toujours dans le land
  let repositionner = false;
  
  if (top < 0) {
    top = 4;
    repositionner = true;
  }
  
  if (left < 0) {
    left = 4;
    repositionner = true;
  }
  
  if (top + menuRect.height > landRect.height) {
    top = landRect.height - menuRect.height - 4;
    repositionner = true;
  }
  
  if (left + menuRect.width > landRect.width) {
    left = landRect.width - menuRect.width - 4;
    repositionner = true;
  }
  
  if (repositionner) {
    menuContextuel.style.top = top + "px";
    menuContextuel.style.left = left + "px";
  }
}

// Redimensionnement de la fenêtre : ajuster le menu contextuel
window.addEventListener("resize", function() {
  if (menuContextuel._targetBocal && menuContextuel.style.display === "block") {
    ajusterPositionMenu(menuContextuel._targetBocal);
  }
});

// ---------------------------
// Variables globales & éléments
// ---------------------------
const fenetre = document.getElementById("fenetre");
const fenetreHeaderTitle = document.querySelector("#fenetreHeader h3");
const menuContextuel = document.getElementById("menuContextuel");
const btnSupprimer  = document.getElementById("btnSupprimer");
const btnAncrer     = document.getElementById("btnAncrer");
const btnVersement  = document.getElementById("btnVersement");
const btnRenommer   = document.getElementById("btnRenommer");
const btnParametre  = document.getElementById("btnParametre");

// Références aux conteneurs principaux
const header = document.getElementById("header");
const land = document.getElementById("land");
const footer = document.getElementById("footer");

// map id -> DOM element (bocal)
const bocalMap = new Map();

// ---------------------------
// LOGO (top-right) - cherche dans le même dossier - CLIQUABLE
// Favicon = Logo (même fichier)
// ---------------------------
(function setupLogo() {
  let logoDiv = document.getElementById("logoDisplay");
  if (!logoDiv) {
    logoDiv = document.createElement("div");
    logoDiv.id = "logoDisplay";
    Object.assign(logoDiv.style, {
      position: "absolute",
      top: "12px",
      right: "12px",
      zIndex: 20000,
      padding: "4px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "transparent",
      pointerEvents: "auto",
      cursor: "pointer"
    });
    
    // Click handler pour aller au home
    logoDiv.addEventListener("click", function() {
      goToHome();
    });
    
    header.appendChild(logoDiv);
  }

  // image element
  let img = logoDiv.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    img.alt = "Logo";
    Object.assign(img.style, {
      maxWidth: "64px",
      maxHeight: "64px",
      display: "block",
      borderRadius: "6px"
    });
    logoDiv.appendChild(img);
  }

  // Chercher le logo dans le même dossier que le fichier HTML
  const tryFiles = ["Logo.png", "Logo.jpg", "Logo.jpeg", "Logo.svg", "Logo.gif", "logo.png", "logo.jpg", "logo.jpeg", "logo.svg", "logo.gif"];
  let tryIndex = 0;

  function tryNextLogo() {
    if (tryIndex >= tryFiles.length) {
      // show placeholder if none worked
      img.style.display = "none";
      let ph = logoDiv.querySelector(".logo-placeholder");
      if (!ph) {
        ph = document.createElement("div");
        ph.className = "logo-placeholder";
        ph.textContent = "Logo";
        Object.assign(ph.style, {
          color: "#000",
          background: "#fff",
          border: "1px solid #ccc",
          padding: "6px 8px",
          borderRadius: "6px",
          fontWeight: "bold"
        });
        logoDiv.appendChild(ph);
      }
      return;
    }
    
    const file = tryFiles[tryIndex++];
    const path = file; // Utiliser le chemin relatif (même dossier)
    
    const tester = new Image();
    tester.onload = function() {
      img.src = path;
      img.style.display = "block";
      const ph = logoDiv.querySelector(".logo-placeholder");
      if (ph) ph.remove();
      
      // Utiliser la même image pour le favicon
      let link = document.querySelector('link[rel~="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = path;
    };
    tester.onerror = function() {
      tryNextLogo();
    };
    tester.src = path;
  }

  tryNextLogo();
})();

// ---------------------------
// Grid overlay for snapping - MODIFIÉ : uniquement dans le Land
// ---------------------------
const gridSpacing = 40; // spacing in px (modifiable)
let gridOverlay = document.getElementById("gridOverlay");
if (!gridOverlay) {
  gridOverlay = document.createElement("div");
  gridOverlay.id = "gridOverlay";
  Object.assign(gridOverlay.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    display: "none",
    zIndex: "5",
    backgroundImage:
      "repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent " + gridSpacing + "px)," +
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent " + gridSpacing + "px)",
    backgroundSize: gridSpacing + "px " + gridSpacing + "px"
  });
  land.appendChild(gridOverlay);
}

// ---------------------------
// Patrimoine Financier display (top-left)
// ---------------------------
let patrimoineEl = document.getElementById("patrimoineDisplay");
if (!patrimoineEl) {
  patrimoineEl = document.createElement("div");
  patrimoineEl.id = "patrimoineDisplay";
  Object.assign(patrimoineEl.style, {
    position: "absolute",
    top: "12px",
    left: "12px",
    background: "transparent",
    color: "#000",
    fontWeight: "bold",
    fontFamily: "Arial, sans-serif",
    zIndex: 20000,
    padding: "4px 8px",
    pointerEvents: "none"
  });
  header.appendChild(patrimoineEl);
}

function updateTotalPatrimoine() {
  const total = bocaux.reduce(function(s, b) {
    let capital = 0;
    
    if (b.categorie === "Goutte") {
      // Pour Goutte, calculer depuis la composition
      if (b.composition) {
        Object.keys(b.composition).forEach(function(label) {
          const qty = b.composition[label] || 0;
          const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
          if (valInfo) {
            capital += qty * valInfo.value;
          }
        });
      }
    } else if (b.categorie === "Fuite") {
      // Pour Fuite, uniquement investissement
      capital = Number(b.investment) || 0;
    } else {
      // Pour Courant et Océan, investissement + intérêts
      const inv = Number(b.investment) || 0;
      const intr = Number(b.interest) || 0;
      capital = inv + intr;
    }
    
    return s + capital;
  }, 0);
  patrimoineEl.textContent = "Patrimoine Financier : " + formatMoney(total);
}

// ---------------------------
// Patrimoine Visé display (top-left, below Patrimoine Financier)
// ---------------------------
let patrimoineViseEl = document.getElementById("patrimoineViseDisplay");
if (!patrimoineViseEl) {
  patrimoineViseEl = document.createElement("div");
  patrimoineViseEl.id = "patrimoineViseDisplay";
  Object.assign(patrimoineViseEl.style, {
    position: "absolute",
    top: "40px", // Positionné en dessous du patrimoine financier
    left: "12px",
    background: "transparent",
    color: "#E74C3C", // Texte en rouge
    fontWeight: "bold",
    fontFamily: "Arial, sans-serif",
    zIndex: 20000,
    padding: "4px 8px",
    pointerEvents: "none"
  });
  header.appendChild(patrimoineViseEl);
}

function updateTotalPatrimoineVise() {
  const total = bocaux.reduce(function(s, b) {
    return s + (formatNumber(b.objectif) || 0);
  }, 0);
  patrimoineViseEl.textContent = "Patrimoine Visé : " + formatMoney(total);
}

// ---------------------------
// Patrimoine Simulé display (top-left, below Patrimoine Visé)
// ---------------------------
let patrimoineSimuleEl = document.getElementById("patrimoineSimuleDisplay");
if (!patrimoineSimuleEl) {
  patrimoineSimuleEl = document.createElement("div");
  patrimoineSimuleEl.id = "patrimoineSimuleDisplay";
  Object.assign(patrimoineSimuleEl.style, {
    position: "absolute",
    top: "68px", // Positionné en dessous du patrimoine visé (40 + 28)
    left: "12px",
    background: "transparent",
    color: "#FF8C00",
    fontWeight: "bold",
    fontFamily: "Arial, sans-serif",
    zIndex: 20000,
    padding: "4px 8px",
    pointerEvents: "none"
  });
  header.appendChild(patrimoineSimuleEl);
}

function updateTotalPatrimoineSimule() {
  const total = bocaux.reduce(function(s, b) {
    return s + (formatNumber(b.simulation) || 0);
  }, 0);
  patrimoineSimuleEl.textContent = "Patrimoine Simulé : " + formatMoney(total);
}

// ---------------------------
// Mission display (bottom-left) - MODIFIÉ avec sélecteurs
// ---------------------------
let missionEl = null;

function initMission() {
  missionEl = document.getElementById("missionDisplay");
  if (!missionEl) {
    missionEl = document.createElement("div");
    missionEl.id = "missionDisplay";
    Object.assign(missionEl.style, {
      position: "absolute",
      bottom: "12px",
      left: "12px",
      color: "#e74c3c", // rouge
      fontWeight: "bold",
      fontFamily: "Arial, sans-serif",
      zIndex: 20000,
      padding: "4px 8px",
      cursor: "pointer",
      userSelect: "none",
      display: "block"
    });
    footer.appendChild(missionEl);
    
    missionEl.addEventListener("click", function(e) {
      e.stopPropagation();
      afficherRenommerMission();
    });
  }
}

// Charger la mission sauvegardée
function loadMission() {
  if (!missionEl) return;
  
  const saved = localStorage.getItem("missionData");
  if (saved) {
    try {
      const missionData = JSON.parse(saved);
      // Formater la date en format français (JJ/MM/AAAA)
      const dateObj = new Date(missionData.echeance);
      const formattedDate = dateObj.toLocaleDateString('fr-FR');
      
      missionEl.textContent = `${missionData.conteneur}: ${formatMoney(missionData.montant)} - ${formattedDate}`;
    } catch (e) {
      missionEl.textContent = "Mission";
    }
  } else {
    missionEl.textContent = "Mission";
  }
}

function afficherRenommerMission() {
  clearFenetreContent();
  fenetreHeaderTitle.textContent = "Définir la Mission";
  
  // Récupérer les données actuelles
  const currentMission = missionEl ? missionEl.textContent : "Mission";
  let currentConteneur = "Mission";
  let currentMontant = 0;
  let currentEcheance = new Date().toISOString().split('T')[0]; // Date du jour par défaut
  
  if (currentMission !== "Mission") {
    const parts = currentMission.split(": ");
    if (parts.length === 2) {
      currentConteneur = parts[0];
      const montantEcheance = parts[1].split(" - ");
      if (montantEcheance.length === 2) {
        currentMontant = formatNumber(montantEcheance[0].replace(' €', ''));
        // Vérifier si l'échéance est une date (format YYYY-MM-JJ)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateRegex.test(montantEcheance[1])) {
          currentEcheance = montantEcheance[1];
        }
      }
    }
  }

  const html = `
    <div style="padding:10px;">
      <div style="margin-bottom:12px;">
        <label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Conteneur</label>
        <select id="mission_conteneur" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">
          <option value="Mission">Mission</option>
          ${bocaux.map(b => `<option value="${b.nom}" ${b.nom === currentConteneur ? 'selected' : ''}>${b.nom}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Montant</label>
        <div style="display:flex;align-items:center;">
          <input type="number" id="mission_montant" value="${currentMontant}" step="0.01" min="0" style="flex:1;padding:8px;">
          <span style="margin-left:8px;font-weight:bold;color:#555;">€</span>
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Échéance</label>
        <input type="date" id="mission_echeance" value="${currentEcheance}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">
      </div>
      <div style="text-align:center;">
        <button id="validerMission" style="background:black;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Valider</button>
      </div>
    </div>
  `;
  
  fenetre.insertAdjacentHTML("beforeend", html);

  const conteneurSelect = document.getElementById("mission_conteneur");
  const montantInput = document.getElementById("mission_montant");
  const echeanceInput = document.getElementById("mission_echeance");
  const validerBtn = document.getElementById("validerMission");

  validerBtn.addEventListener("click", function() {
    const conteneur = conteneurSelect.value;
    const montant = formatNumber(montantInput.value);
    const echeance = echeanceInput.value;

    if (conteneur === "Mission") {
      missionEl.textContent = "Mission";
      localStorage.removeItem("missionData");
    } else {
      // Formater la date en format français (JJ/MM/AAAA)
      const dateObj = new Date(echeance);
      const formattedDate = dateObj.toLocaleDateString('fr-FR');
      
      missionEl.textContent = `${conteneur}: ${formatMoney(montant)} - ${formattedDate}`;
      localStorage.setItem("missionData", JSON.stringify({
        conteneur: conteneur,
        montant: montant,
        echeance: echeance // Stocker en format ISO pour la réutilisation
      }));
    }
    fermerFenetre();
  });

  fenetre.style.display = "block";
  fenetre.focus();
}

function clearFenetreContent(){
  Array.from(fenetre.children)
    .filter(function(c) { return c.id !== "fenetreHeader"; })
    .forEach(function(c) { c.remove(); });
}

// ---------------------------
// Fenêtre Création (dynamique selon catégorie) - MODIFIÉE AVEC OBJECTIF ET SIMULATION DYNAMIQUE
// ---------------------------
function afficherFenetre(){
  clearFenetreContent();
  fenetreHeaderTitle.textContent = "Création de Conteneur";
  
  let html = 
    '<div style="padding:10px;max-height:500px;overflow-y:auto;">' +
      '<div class="champ">' +
        '<input type="text" id="nom" placeholder="Nom de l\'enveloppe" maxlength="25" required pattern="[a-zA-ZÀ-ÿ\\s]+">' +
        '<span id="compteur">0/25</span>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Catégorie</label>' +
        '<select id="categorie_creation" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">' +
          '<option value="Goutte">Goutte</option>' +
          '<option value="Courant">Courant</option>' +
          '<option value="Océan">Océan</option>' +
          '<option value="Fuite">Fuite</option>' +
        '</select>' +
      '</div>' +
      '<div id="champs_dynamiques"></div>' +
      '<button id="validerBtn" style="display:block;margin:20px auto 0;padding:8px 16px;border-radius:4px;background:black;color:white;border:none;cursor:pointer;">Valider</button>' +
    '</div>';
  
  fenetre.insertAdjacentHTML("beforeend", html);
  
  const categorieSelect = document.getElementById("categorie_creation");
  const champsDynamiques = document.getElementById("champs_dynamiques");
  const nomInput = document.getElementById("nom");
  const compteur = document.getElementById("compteur");
  
  nomInput.addEventListener("input", function() {
    compteur.textContent = nomInput.value.length + "/25";
  });
  
  function updateChampsDynamiques() {
    const cat = categorieSelect.value;
    champsDynamiques.innerHTML = "";
    fenetre.style.width = "360px";
    
    if (cat === "Goutte") {
      fenetre.style.width = "480px";
      champsDynamiques.innerHTML = 
        '<div class="objectif-dynamique-container">' +
          '<div class="objectif-dynamique-label">' +
            '<label style="font-weight:bold;color:#555;" id="objectifLabelCreation">Objectif</label>' +
            '<input type="checkbox" id="objectif_dynamique_creation" class="objectif-dynamique-checkbox">' +
          '</div>' +
          '<input type="number" id="objectif_creation" value="0" step="0.01" min="0" style="width:150px;padding:8px;">' +
        '</div>' +
        '<div id="config_dynamique_creation" class="config-dynamique-container" style="display:none;">' +
          '<div class="config-dynamique-header">' +
            '<div class="config-dynamique-title">Configuration Objectif</div>' +
            '<button id="ajouter_conteneur_creation" class="ajouter-conteneur-btn">+ Ajouter</button>' +
          '</div>' +
          '<div id="lignes_conteneurs_creation"></div>' +
          '<div id="total_dynamique_creation" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
        '</div>' +
        '<div class="simulation-dynamique-container" style="margin-top:15px;">' +
          '<div class="simulation-dynamique-label">' +
            '<label style="font-weight:bold;color:#555;" id="simulationLabelCreation">Simulation</label>' +
            '<input type="checkbox" id="simulation_dynamique_creation" class="simulation-dynamique-checkbox">' +
          '</div>' +
          '<input type="number" id="simulation_creation" value="0" step="0.01" min="0" style="width:150px;padding:8px;">' +
        '</div>' +
        '<div id="config_simulation_creation" class="config-dynamique-container" style="display:none;margin-top:10px;">' +
          '<div class="config-dynamique-header">' +
            '<div class="config-dynamique-title">Configuration Simulation</div>' +
            '<button id="ajouter_conteneur_simulation_creation" class="ajouter-conteneur-btn">+ Ajouter</button>' +
          '</div>' +
          '<div id="lignes_conteneurs_simulation_creation"></div>' +
          '<div id="total_simulation_dynamique_creation" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
        '</div>' +
        '<div id="composition_creation">' +
          '<label style="display:block;margin-bottom:8px;font-weight:bold;color:#555;">Composition monétaire</label>' +
        '</div>' +
        '<div id="total_composition_creation" style="margin-top: 8px; padding: 8px; background: #e8f5e9; border-radius: 4px; display: none;">' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">' +
            '<span style="color: #007BFF; font-weight: bold;">Billets:</span>' +
            '<span style="color: #007BFF; font-weight: bold;" id="total_billets_creation">0 €</span>' +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">' +
            '<span style="color: #D79A10; font-weight: bold;">Pièces:</span>' +
            '<span style="color: #D79A10; font-weight: bold;" id="total_pieces_creation">0 €</span>' +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; border-top: 1px solid #ccc; padding-top: 4px; margin-top: 4px;">' +
            '<span style="color: #2ecc71; font-weight: bold;">Total:</span>' +
            '<span style="color: #2ecc71; font-weight: bold;" id="total_composition_affichage_creation">0 €</span>' +
          '</div>' +
        '</div>';
      
      const compContainer = document.getElementById("composition_creation");
      monnaieValues.forEach(function(groupe) {
        const gridCols = groupe.values.length === 4 ? "repeat(4,1fr)" : groupe.values.length === 2 ? "repeat(2,1fr)" : "repeat(3,1fr)";
        let groupeHtml = '<div style="margin-bottom:10px;padding:8px;background:#f9f9f9;border-radius:4px;">' +
          '<div style="font-weight:bold;color:#666;margin-bottom:6px;font-size:13px;">' + groupe.groupe + '</div>' +
          '<div style="display:grid;grid-template-columns:' + gridCols + ';gap:6px;">';
        
        groupe.values.forEach(function(v) {
          groupeHtml += '<div style="display:flex;flex-direction:column;align-items:center;">' +
            '<span style="font-size:12px;color:#666;margin-bottom:2px;">' + v.label + '</span>' +
            '<input type="number" class="monnaie-input-creation" data-label="' + v.label + '" data-value="' + v.value + '" ' +
                   'value="0" min="0" step="1" style="width:100%;padding:4px;text-align:center;font-size:12px;">' +
          '</div>';
        });
        
        groupeHtml += '</div></div>';
        compContainer.insertAdjacentHTML("beforeend", groupeHtml);
      });
      
      // Afficher le total de composition
      document.getElementById("total_composition_creation").style.display = "block";
      
      // Calculer le total initial
      calculerTotalCompositionCreation();
      
      // Ajouter les écouteurs d'événements pour mettre à jour le total
      const inputs = document.querySelectorAll(".monnaie-input-creation");
      inputs.forEach(function(input) {
        input.addEventListener("input", calculerTotalCompositionCreation);
      });
      
    } else if (cat === "Courant" || cat === "Océan") {
      champsDynamiques.innerHTML = 
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Plafond</label>' +
          '<div style="display:flex;align-items:center;">' +
            '<input type="number" id="plafond_creation" value="0" step="0.01" min="0" style="flex:1;padding:8px;">' +
            '<span style="margin-left:8px;font-weight:bold;color:#555;">€</span>' +
          '</div>' +
        '</div>' +
        '<div class="objectif-dynamique-container">' +
          '<div class="objectif-dynamique-label">' +
            '<label style="font-weight:bold;color:#555;" id="objectifLabelCreation">Objectif</label>' +
            '<input type="checkbox" id="objectif_dynamique_creation" class="objectif-dynamique-checkbox">' +
          '</div>' +
          '<input type="number" id="objectif_creation" value="0" step="0.01" min="0" style="width:150px;padding:8px;">' +
        '</div>' +
        '<div id="config_dynamique_creation" class="config-dynamique-container" style="display:none;">' +
          '<div class="config-dynamique-header">' +
            '<div class="config-dynamique-title">Configuration Objectif</div>' +
            '<button id="ajouter_conteneur_creation" class="ajouter-conteneur-btn">+ Ajouter</button>' +
          '</div>' +
          '<div id="lignes_conteneurs_creation"></div>' +
          '<div id="total_dynamique_creation" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
        '</div>' +
        '<div class="simulation-dynamique-container" style="margin-top:15px;">' +
          '<div class="simulation-dynamique-label">' +
            '<label style="font-weight:bold;color:#555;" id="simulationLabelCreation">Simulation</label>' +
            '<input type="checkbox" id="simulation_dynamique_creation" class="simulation-dynamique-checkbox">' +
          '</div>' +
          '<input type="number" id="simulation_creation" value="0" step="0.01" min="0" style="width:150px;padding:8px;">' +
        '</div>' +
        '<div id="config_simulation_creation" class="config-dynamique-container" style="display:none;margin-top:10px;">' +
          '<div class="config-dynamique-header">' +
            '<div class="config-dynamique-title">Configuration Simulation</div>' +
            '<button id="ajouter_conteneur_simulation_creation" class="ajouter-conteneur-btn">+ Ajouter</button>' +
          '</div>' +
          '<div id="lignes_conteneurs_simulation_creation"></div>' +
          '<div id="total_simulation_dynamique_creation" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
        '</div>';
      
    } else if (cat === "Fuite") {
      champsDynamiques.innerHTML = 
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Montant</label>' +
          '<div style="display:flex;align-items:center;">' +
            '<input type="number" id="montant_creation" value="0" step="0.01" min="0" style="flex:1;padding:8px;">' +
            '<span style="margin-left:8px;font-weight:bold;color:#555;">€</span>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Période</label>' +
          '<select id="periode_creation" style="width:100%;padding:8px;">' +
            periodesFuite.map(function(p) { return '<option value="' + p + '">' + p + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div class="objectif-dynamique-container">' +
          '<div class="objectif-dynamique-label">' +
            '<label style="font-weight:bold;color:#555;" id="objectifLabelCreation">Objectif</label>' +
            '<input type="checkbox" id="objectif_dynamique_creation" class="objectif-dynamique-checkbox">' +
          '</div>' +
          '<input type="number" id="objectif_creation" value="0" step="0.01" min="0" style="width:150px;padding:8px;">' +
        '</div>' +
        '<div id="config_dynamique_creation" class="config-dynamique-container" style="display:none;">' +
          '<div class="config-dynamique-header">' +
            '<div class="config-dynamique-title">Configuration Objectif</div>' +
            '<button id="ajouter_conteneur_creation" class="ajouter-conteneur-btn">+ Ajouter</button>' +
          '</div>' +
          '<div id="lignes_conteneurs_creation"></div>' +
          '<div id="total_dynamique_creation" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
        '</div>' +
        '<div class="simulation-dynamique-container" style="margin-top:15px;">' +
          '<div class="simulation-dynamique-label">' +
            '<label style="font-weight:bold;color:#555;" id="simulationLabelCreation">Simulation</label>' +
            '<input type="checkbox" id="simulation_dynamique_creation" class="simulation-dynamique-checkbox">' +
          '</div>' +
          '<input type="number" id="simulation_creation" value="0" step="0.01" min="0" style="width:150px;padding:8px;">' +
        '</div>' +
        '<div id="config_simulation_creation" class="config-dynamique-container" style="display:none;margin-top:10px;">' +
          '<div class="config-dynamique-header">' +
            '<div class="config-dynamique-title">Configuration Simulation</div>' +
            '<button id="ajouter_conteneur_simulation_creation" class="ajouter-conteneur-btn">+ Ajouter</button>' +
          '</div>' +
          '<div id="lignes_conteneurs_simulation_creation"></div>' +
          '<div id="total_simulation_dynamique_creation" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
        '</div>';
    }
    
    // Gestion de la case à cocher objectif dynamique
    const checkboxDynamique = document.getElementById("objectif_dynamique_creation");
    const inputObjectif = document.getElementById("objectif_creation");
    const configContainer = document.getElementById("config_dynamique_creation");
    const labelObjectif = document.getElementById("objectifLabelCreation");
    
    if (checkboxDynamique) {
      checkboxDynamique.addEventListener("change", function() {
        if (this.checked) {
          labelObjectif.textContent = "Objectif Dynamique";
          inputObjectif.readOnly = true;
          inputObjectif.style.backgroundColor = "#f5f5f5";
          inputObjectif.style.color = "#666";
          
          // Afficher la configuration
          if (configContainer) {
            configContainer.style.display = "block";
            
            // Créer une ligne vide par défaut
            if (document.querySelectorAll(".ligne-conteneur-creation").length === 0) {
              creerLigneConteneurCreation("lignes_conteneurs_creation");
            }
            
            // Calculer le total initial
            calculerTotalDynamiqueCreation("config_dynamique_creation", "objectif_creation");
          }
        } else {
          labelObjectif.textContent = "Objectif";
          inputObjectif.readOnly = false;
          inputObjectif.style.backgroundColor = "";
          inputObjectif.style.color = "";
          
          // Cacher la configuration
          if (configContainer) {
            configContainer.style.display = "none";
          }
        }
      });
      
      // Bouton pour ajouter une ligne
      const btnAjouter = document.getElementById("ajouter_conteneur_creation");
      if (btnAjouter) {
        btnAjouter.addEventListener("click", function() {
          creerLigneConteneurCreation("lignes_conteneurs_creation");
        });
      }
    }
    
    // Gestion de la case à cocher simulation dynamique
    const checkboxSimulationDynamique = document.getElementById("simulation_dynamique_creation");
    const inputSimulation = document.getElementById("simulation_creation");
    const configSimulationContainer = document.getElementById("config_simulation_creation");
    const labelSimulation = document.getElementById("simulationLabelCreation");
    
    if (checkboxSimulationDynamique) {
      checkboxSimulationDynamique.addEventListener("change", function() {
        if (this.checked) {
          labelSimulation.textContent = "Simulation Dynamique";
          inputSimulation.readOnly = true;
          inputSimulation.style.backgroundColor = "#f5f5f5";
          inputSimulation.style.color = "#666";
          
          // Afficher la configuration
          if (configSimulationContainer) {
            configSimulationContainer.style.display = "block";
            
            // Créer une ligne vide par défaut
            if (document.querySelectorAll(".ligne-conteneur-simulation-creation").length === 0) {
              creerLigneConteneurCreation("lignes_conteneurs_simulation_creation", "simulation");
            }
            
            // Calculer le total initial
            calculerTotalDynamiqueCreation("config_simulation_creation", "simulation_creation");
          }
        } else {
          labelSimulation.textContent = "Simulation";
          inputSimulation.readOnly = false;
          inputSimulation.style.backgroundColor = "";
          inputSimulation.style.color = "";
          
          // Cacher la configuration
          if (configSimulationContainer) {
            configSimulationContainer.style.display = "none";
          }
        }
      });
      
      // Bouton pour ajouter une ligne
      const btnAjouterSimulation = document.getElementById("ajouter_conteneur_simulation_creation");
      if (btnAjouterSimulation) {
        btnAjouterSimulation.addEventListener("click", function() {
          creerLigneConteneurCreation("lignes_conteneurs_simulation_creation", "simulation");
        });
      }
    }
  }
  
  // Fonction pour créer une ligne de conteneur dans la création
  function creerLigneConteneurCreation(containerId, type = "objectif") {
    const lignesConteneurs = document.getElementById(containerId);
    const ligneDiv = document.createElement("div");
    ligneDiv.className = type === "simulation" ? "ligne-conteneur ligne-conteneur-simulation-creation" : "ligne-conteneur ligne-conteneur-creation";
    
    // Select pour choisir le conteneur
    const select = document.createElement("select");
    select.className = "select-conteneur";
    select.appendChild(new Option("Sélectionner un conteneur", ""));
    
    // Filtrer les bocaux existants
    bocaux.forEach(function(b) {
      select.appendChild(new Option(b.nom, b.id));
    });
    
    // Input pour le pourcentage
    const inputPourcentage = document.createElement("input");
    inputPourcentage.type = "number";
    inputPourcentage.className = "pourcentage-input";
    inputPourcentage.placeholder = "0%";
    inputPourcentage.min = "0";
    inputPourcentage.max = "100";
    inputPourcentage.step = "1";
    
    // Bouton de suppression
    const btnSupprimer = document.createElement("button");
    btnSupprimer.className = "supprimer-ligne-btn";
    btnSupprimer.textContent = "×";
    btnSupprimer.title = "Supprimer cette ligne";
    
    // Événements
    select.addEventListener("change", function() {
      if (type === "simulation") {
        calculerTotalDynamiqueCreation(
          type === "simulation" ? "config_simulation_creation" : "config_dynamique_creation",
          type === "simulation" ? "simulation_creation" : "objectif_creation",
          type
        );
      } else {
        calculerTotalDynamiqueCreation(
          type === "simulation" ? "config_simulation_creation" : "config_dynamique_creation",
          type === "simulation" ? "simulation_creation" : "objectif_creation",
          type
        );
      }
    });
    inputPourcentage.addEventListener("input", function() {
      if (type === "simulation") {
        calculerTotalDynamiqueCreation(
          type === "simulation" ? "config_simulation_creation" : "config_dynamique_creation",
          type === "simulation" ? "simulation_creation" : "objectif_creation",
          type
        );
      } else {
        calculerTotalDynamiqueCreation(
          type === "simulation" ? "config_simulation_creation" : "config_dynamique_creation",
          type === "simulation" ? "simulation_creation" : "objectif_creation",
          type
        );
      }
    });
    btnSupprimer.addEventListener("click", function() {
      ligneDiv.remove();
      if (type === "simulation") {
        calculerTotalDynamiqueCreation(
          type === "simulation" ? "config_simulation_creation" : "config_dynamique_creation",
          type === "simulation" ? "simulation_creation" : "objectif_creation",
          type
        );
      } else {
        calculerTotalDynamiqueCreation(
          type === "simulation" ? "config_simulation_creation" : "config_dynamique_creation",
          type === "simulation" ? "simulation_creation" : "objectif_creation",
          type
        );
      }
    });
    
    ligneDiv.appendChild(select);
    ligneDiv.appendChild(inputPourcentage);
    ligneDiv.appendChild(document.createTextNode("%"));
    ligneDiv.appendChild(btnSupprimer);
    lignesConteneurs.appendChild(ligneDiv);
    
    return ligneDiv;
  }
  
  // Fonction pour calculer le total dynamique dans la création
  function calculerTotalDynamiqueCreation(configContainerId, inputId, type = "objectif") {
    const lignes = document.querySelectorAll(configContainerId === "config_simulation_creation" ? 
      ".ligne-conteneur-simulation-creation" : ".ligne-conteneur-creation");
    let total = 0;
    
    lignes.forEach(function(ligne) {
      const select = ligne.querySelector(".select-conteneur");
      const input = ligne.querySelector(".pourcentage-input");
      
      if (select.value && input.value) {
        const bocalId = select.value;
        const pourcentage = parseFloat(input.value) || 0;
        const bocal = bocaux.find(function(b) { return b.id === bocalId; });
        
        if (bocal) {
          let capital = 0;
          
          // MODIFICATION IMPORTANTE: Pour les simulations dynamiques, utiliser la simulation
          if (type === "simulation") {
            // Pour les simulations dynamiques, utiliser la valeur de simulation du bocal
            capital = bocal.simulation || 0;
          } else {
            // Pour les objectifs dynamiques, utiliser le capital (comme avant)
            if (bocal.categorie === "Goutte") {
              if (bocal.composition) {
                Object.keys(bocal.composition).forEach(function(label) {
                  const qty = bocal.composition[label] || 0;
                  const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
                  if (valInfo) {
                    capital += qty * valInfo.value;
                  }
                });
              }
            } else if (bocal.categorie === "Fuite") {
              capital = bocal.investment || 0;
            } else {
              capital = (bocal.investment || 0) + (bocal.interest || 0);
            }
          }
          
          total += capital * (pourcentage / 100);
        }
      }
    });
    
    const totalDisplay = document.getElementById(configContainerId === "config_simulation_creation" ? 
      "total_simulation_dynamique_creation" : "total_dynamique_creation");
    if (totalDisplay) {
      totalDisplay.textContent = "Total: " + formatMoney(total);
    }
    
    // Mettre à jour l'input correspondant
    const inputObj = document.getElementById(inputId);
    if (inputObj) {
      inputObj.value = formatNumber(total);
    }
  }
  
  // Fonction pour calculer le total de la composition dans la création
  function calculerTotalCompositionCreation() {
    const inputs = document.querySelectorAll(".monnaie-input-creation");
    let totalBillets = 0;
    let totalPieces = 0;
    
    inputs.forEach(function(input) {
      const quantite = parseInt(input.value) || 0;
      const valeur = parseFloat(input.dataset.value) || 0;
      const label = input.dataset.label;
      const montant = quantite * valeur;
      
      if (label === "5€" || label === "10€" || label === "20€" || label === "50€") {
        totalBillets += montant;
      } else {
        totalPieces += montant;
      }
    });
    
    const total = totalBillets + totalPieces;
    
    // Mettre à jour l'affichage
    document.getElementById("total_billets_creation").textContent = formatMoney(totalBillets);
    document.getElementById("total_pieces_creation").textContent = formatMoney(totalPieces);
    document.getElementById("total_composition_affichage_creation").textContent = formatMoney(total);
  }
  
  categorieSelect.addEventListener("change", updateChampsDynamiques);
  updateChampsDynamiques();
  
  const validerBtn = document.getElementById("validerBtn");
  validerBtn.addEventListener("click", function() {
    const nom = nomInput.value.trim();
    if (!nom) {
      alert("Veuillez saisir un nom");
      return;
    }
    
    const cat = categorieSelect.value;
    const objectifInput = document.getElementById("objectif_creation");
    const objectif = objectifInput ? formatNumber(objectifInput.value) : 0;
    const objectifDynamique = document.getElementById("objectif_dynamique_creation") ? document.getElementById("objectif_dynamique_creation").checked : false;
    
    const simulationInput = document.getElementById("simulation_creation");
    const simulation = simulationInput ? formatNumber(simulationInput.value) : 0;
    const simulationDynamique = document.getElementById("simulation_dynamique_creation") ? document.getElementById("simulation_dynamique_creation").checked : false;
    
    let objectifDynamiqueConfig = [];
    if (objectifDynamique) {
      // Récupérer la configuration des objectifs dynamiques
      const lignes = document.querySelectorAll(".ligne-conteneur-creation");
      lignes.forEach(function(ligne) {
        const select = ligne.querySelector(".select-conteneur");
        const input = ligne.querySelector(".pourcentage-input");
        
        if (select.value && input.value) {
          objectifDynamiqueConfig.push({
            bocalId: select.value,
            pourcentage: parseFloat(input.value) || 0
          });
        }
      });
    }
    
    let simulationDynamiqueConfig = [];
    if (simulationDynamique) {
      // Récupérer la configuration des simulations dynamiques
      const lignes = document.querySelectorAll(".ligne-conteneur-simulation-creation");
      lignes.forEach(function(ligne) {
        const select = ligne.querySelector(".select-conteneur");
        const input = ligne.querySelector(".pourcentage-input");
        
        if (select.value && input.value) {
          simulationDynamiqueConfig.push({
            bocalId: select.value,
            pourcentage: parseFloat(input.value) || 0
          });
        }
      });
    }
    
    let plafond = 0;
    let montantFuite = 0;
    let periodeFuite = "Mensuel";
    let composition = {};
    
    if (cat === "Goutte") {
      // Récupérer la composition
      const inputs = document.querySelectorAll(".monnaie-input-creation");
      inputs.forEach(function(inp) {
        const qty = parseFloat(inp.value) || 0;
        composition[inp.dataset.label] = qty;
      });
    } else if (cat === "Courant" || cat === "Océan") {
      const plafondInput = document.getElementById("plafond_creation");
      plafond = plafondInput ? formatNumber(plafondInput.value) : 0;
    } else if (cat === "Fuite") {
      const montantInput = document.getElementById("montant_creation");
      const periodeInput = document.getElementById("periode_creation");
      montantFuite = montantInput ? formatNumber(montantInput.value) : 0;
      periodeFuite = periodeInput ? periodeInput.value : "Mensuel";
    }
    
    // Créer le bocal
    const newBocal = creerBocal(nom, plafond, 0, objectif, simulation, 100, 100, null, false, null, 0, 0, false, cat);
    
    // Appliquer les données spécifiques
    const idx = bocaux.findIndex(function(b) { return b.id === newBocal._id; });
    if (idx !== -1) {
      if (cat === "Goutte") {
        bocaux[idx].composition = composition;
        // Calculer billets/pièces
        let totalBillets = 0;
        let totalPieces = 0;
        Object.keys(composition).forEach(function(label) {
          const qty = composition[label];
          const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
          if (valInfo) {
            const montant = qty * valInfo.value;
            if (label === "5€" || label === "10€" || label === "20€" || label === "50€") {
              totalBillets += montant;
            } else {
              totalPieces += montant;
            }
          }
        });
        newBocal._investment = formatNumber(totalBillets);
        newBocal._interest = formatNumber(totalPieces);
        bocaux[idx].investment = formatNumber(totalBillets);
        bocaux[idx].interest = formatNumber(totalPieces);
      } else if (cat === "Fuite") {
        bocaux[idx].montantFuite = formatNumber(montantFuite);
        bocaux[idx].periodeFuite = periodeFuite;
        newBocal._interest = formatNumber(montantFuite);
        bocaux[idx].interest = formatNumber(montantFuite);
      }
      
      // Appliquer l'objectif et la simulation dynamique
      bocaux[idx].objectifDynamique = objectifDynamique;
      bocaux[idx].objectifDynamiqueConfig = objectifDynamiqueConfig;
      bocaux[idx].simulationDynamique = simulationDynamique;
      bocaux[idx].simulationDynamiqueConfig = simulationDynamiqueConfig;
      
      saveBocaux();
    }
    
    updateBocalDisplay(newBocal);
    fenetre.style.width = "360px";
    fermerFenetre();
  });
  
  fenetre.style.display = "block";
  fenetre.focus();
}

// ---------------------------
// INTERFACE DE VERSEMENT AMÉLIORÉE POUR LES GOÛTES
// ---------------------------

// Afficher infos popup dans le menu contextuel sur mobile
function mettreAJourInfoMenuMobile(bocal) {
  if (!isTouchDevice()) return;
  let infoDiv = document.getElementById("menuInfoMobile");
  if (!infoDiv) {
    infoDiv = document.createElement("div");
    infoDiv.id = "menuInfoMobile";
    Object.assign(infoDiv.style, {
      padding: "8px 12px",
      fontSize: "12px",
      color: "#555",
      borderBottom: "1px solid #eee",
      marginBottom: "4px",
      lineHeight: "1.8"
    });
    menuContextuel.insertBefore(infoDiv, menuContextuel.firstChild);
  }
  const idx = bocaux.findIndex(b => b.id === bocal._id);
  if (idx === -1) return;
  const b = bocaux[idx];
  let html = "<strong>" + b.nom + "</strong><br>";
  if (b.categorie === "Goutte") {
    html += "Billets: " + formatMoney(b.investment) + "<br>";
    html += "Pièces: "  + formatMoney(b.interest)   + "<br>";
  } else if (b.categorie === "Fuite") {
    html += "Investissement: " + formatMoney(b.investment) + "<br>";
  } else {
    html += "Investissement: " + formatMoney(b.investment) + "<br>";
    html += "Intérêts: "       + formatMoney(b.interest)   + "<br>";
  }
  html += "<strong style='color:#2ecc71'>Capital: " + formatMoney(b.capital) + "</strong>";
  infoDiv.innerHTML = html;
}

function afficherVersement(){
  clearFenetreContent();
  fenetreHeaderTitle.textContent = "Versement";

  const sorted = bocaux
    .map(function(b) { return { id: b.id, nom: b.nom, categorie: b.categorie }; })
    .sort(function(a,b) { return a.nom.localeCompare(b.nom, 'fr'); });

  const container = document.createElement("div");
  Object.assign(container.style, { 
      display:"flex", 
      flexDirection: "column",
      gap:"15px", 
      padding:"15px", 
      width:"100%"
  });

  // Ligne de sélection avec total au-dessus de la flèche
  const selectionRow = document.createElement("div");
  Object.assign(selectionRow.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "20px",
      width: "100%",
      marginBottom: "10px",
      position: "relative"
  });

  // Select Sortie
  const selectSortie = document.createElement("select");
  selectSortie.id = "select_sortie";
  Object.assign(selectSortie.style, {
      padding: "8px",
      borderRadius: "4px",
      border: "1px solid #ccc",
      minWidth: "120px"
  });
  selectSortie.appendChild(new Option("Sortie", ""));
  sorted.forEach(function(o) { selectSortie.appendChild(new Option(o.nom, o.id)); });

  // Flèche
  const fleche = document.createElement("div");
  fleche.textContent = "→";
  Object.assign(fleche.style, {
      fontSize: "20px",
      fontWeight: "bold",
      color: "#333"
  });

  // Select Entrée
  const selectEntree = document.createElement("select");
  selectEntree.id = "select_entree";
  Object.assign(selectEntree.style, {
      padding: "8px",
      borderRadius: "4px",
      border: "1px solid #ccc",
      minWidth: "120px"
  });
  selectEntree.appendChild(new Option("Entrée", ""));
  sorted.forEach(function(o) { selectEntree.appendChild(new Option(o.nom, o.id)); });

  // Affichage du total au-dessus de la flèche
  const totalDisplay = document.createElement("div");
  totalDisplay.id = "totalDisplay";
  Object.assign(totalDisplay.style, {
      position: "absolute",
      top: "-25px",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: "14px",
      fontWeight: "bold",
      color: "#2ecc71",
      display: "none"
  });
  totalDisplay.textContent = "Total: " + formatMoney(0);

  selectionRow.appendChild(selectSortie);
  selectionRow.appendChild(fleche);
  selectionRow.appendChild(selectEntree);
  selectionRow.appendChild(totalDisplay);
  container.appendChild(selectionRow);

  // Container pour les champs dynamiques
  const dynamicContainer = document.createElement("div");
  dynamicContainer.id = "dynamicContainer";
  Object.assign(dynamicContainer.style, {
      width: "100%",
      display: "flex",
      flexDirection: "column"
  });
  container.appendChild(dynamicContainer);

  // Error message
  const errorDiv = document.createElement("div");
  errorDiv.id = "versementError";
  Object.assign(errorDiv.style, {
      color: "red", 
      textAlign: "center", 
      marginTop: "8px", 
      display: "none",
      fontSize: "14px"
  });
  container.appendChild(errorDiv);

  fenetre.appendChild(container);

  // Fonction pour créer l'interface standard (sans Goutte)
  function creerInterfaceStandard() {
      dynamicContainer.innerHTML = "";
      
      const saisieRow = document.createElement("div");
      Object.assign(saisieRow.style, {
          display: "flex",
          gap: "15px",
          width: "100%",
          justifyContent: "center"
      });

      // Champ Investissement
      const investGroup = document.createElement("div");
      Object.assign(investGroup.style, {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "5px"
      });

      const labelInvest = document.createElement("label");
      labelInvest.textContent = "Investissement";
      labelInvest.htmlFor = "montant_invest";
      Object.assign(labelInvest.style, {
          fontWeight: "bold",
          color: "#007BFF",
          fontSize: "14px"
      });

      const inputInvest = document.createElement("input");
      inputInvest.type = "number";
      inputInvest.id = "montant_invest";
      inputInvest.step = "0.01";
      inputInvest.min = "0";
      inputInvest.placeholder = "0.00";
      Object.assign(inputInvest.style, {
          padding: "8px",
          border: "1px solid #007BFF",
          borderRadius: "4px",
          textAlign: "center",
          width: "100px"
      });

      const euroInvest = document.createElement("span");
      euroInvest.textContent = "€";
      Object.assign(euroInvest.style, {
          color: "#007BFF",
          fontWeight: "bold"
      });

      const investWrapper = document.createElement("div");
      Object.assign(investWrapper.style, {
          display: "flex",
          alignItems: "center",
          gap: "5px"
      });
      investWrapper.appendChild(inputInvest);
      investWrapper.appendChild(euroInvest);

      investGroup.appendChild(labelInvest);
      investGroup.appendChild(investWrapper);

      // Champ Intérêt
      const interetGroup = document.createElement("div");
      Object.assign(interetGroup.style, {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "5px"
      });

      const labelInteret = document.createElement("label");
      labelInteret.textContent = "Intérêt";
      labelInteret.htmlFor = "montant_interet";
      Object.assign(labelInteret.style, {
          fontWeight: "bold",
          color: "#D79A10",
          fontSize: "14px"
      });

      const inputInteret = document.createElement("input");
      inputInteret.type = "number";
      inputInteret.id = "montant_interet";
      inputInteret.step = "0.01";
      inputInteret.min = "0";
      inputInteret.placeholder = "0.00";
      Object.assign(inputInteret.style, {
          padding: "8px",
          border: "1px solid #D79A10",
          borderRadius: "4px",
          textAlign: "center",
          width: "100px"
      });

      const euroInteret = document.createElement("span");
      euroInteret.textContent = "€";
      Object.assign(euroInteret.style, {
          color: "#D79A10",
          fontWeight: "bold"
      });

      const interetWrapper = document.createElement("div");
      Object.assign(interetWrapper.style, {
          display: "flex",
          alignItems: "center",
          gap: "5px"
      });
      interetWrapper.appendChild(inputInteret);
      interetWrapper.appendChild(euroInteret);

      interetGroup.appendChild(labelInteret);
      interetGroup.appendChild(interetWrapper);

      saisieRow.appendChild(investGroup);
      saisieRow.appendChild(interetGroup);
      dynamicContainer.appendChild(saisieRow);

      // Activer/désactiver selon la sélection
      const atLeastOneSelected = selectSortie.value || selectEntree.value;
      inputInvest.disabled = !atLeastOneSelected;
      inputInteret.disabled = !atLeastOneSelected;
      inputInvest.style.opacity = atLeastOneSelected ? "1" : "0.5";
      inputInteret.style.opacity = atLeastOneSelected ? "1" : "0.5";

      // Mettre à jour le total pour les champs standard
      function updateTotalStandard() {
          const montantInvest = formatNumber(inputInvest.value) || 0;
          const montantInteret = formatNumber(inputInteret.value) || 0;
          const total = montantInvest + montantInteret;
          totalDisplay.textContent = "Total: " + formatMoney(total);
          totalDisplay.style.display = "block";
      }

      inputInvest.addEventListener("input", updateTotalStandard);
      inputInteret.addEventListener("input", updateTotalStandard);

      return { inputInvest, inputInteret };
  }

  // Fonction pour créer l'interface avec composition (quand une Goutte est impliquée)
  function creerInterfaceAvecComposition() {
      dynamicContainer.innerHTML = "";
      fenetre.style.width = "480px";
      
      const section = document.createElement("div");
      section.className = "transaction-section";
      
      const titre = document.createElement("div");
      titre.className = "transaction-section-title";
      titre.textContent = "Composition du transfert";
      section.appendChild(titre);

      const compositionContainer = document.createElement("div");
      Object.assign(compositionContainer.style, {
          width: "100%",
          maxHeight: "300px",
          overflowY: "auto",
          padding: "10px"
      });

      // Récupérer les informations des conteneurs
      const sortieBocal = selectSortie.value ? bocaux.find(function(b) { return b.id === selectSortie.value; }) : null;
      const entreeBocal = selectEntree.value ? bocaux.find(function(b) { return b.id === selectEntree.value; }) : null;

      // Déterminer la composition de référence (pour les max)
      let compositionReference = {};
      if (sortieBocal && sortieBocal.categorie === "Goutte") {
          const idxSortie = bocaux.findIndex(function(b) { return b.id === sortieBocal.id; });
          compositionReference = (idxSortie !== -1 && bocaux[idxSortie].composition) ? bocaux[idxSortie].composition : {};
      }

      // Générer les inputs pour chaque type de monnaie
      monnaieValues.forEach(function(groupe) {
          const groupeDiv = document.createElement("div");
          groupeDiv.className = "groupe-monnaie";
          
          const groupeTitre = document.createElement("div");
          groupeTitre.className = "groupe-monnaie-titre";
          groupeTitre.textContent = groupe.groupe;
          groupeDiv.appendChild(groupeTitre);

          const grid = document.createElement("div");
          grid.className = "composition-grid";
          
          groupe.values.forEach(function(v) {
              const inputGroup = document.createElement("div");
              inputGroup.style.display = "flex";
              inputGroup.style.flexDirection = "column";
              inputGroup.style.alignItems = "center";

              const label = document.createElement("span");
              label.textContent = v.label;
              label.style.fontSize = "12px";
              label.style.color = "#666";
              label.style.marginBottom = "2px";

              const input = document.createElement("input");
              input.type = "number";
              input.className = "composition-input";
              input.dataset.label = v.label;
              input.dataset.value = v.value;
              input.value = "0";
              input.min = "0";
              // Si c'est une Goutte en sortie, limiter par la composition disponible
              if (sortieBocal && sortieBocal.categorie === "Goutte") {
                  input.max = compositionReference[v.label] || 0;
              }
              input.step = "1";
              Object.assign(input.style, {
                  width: "100%",
                  padding: "4px",
                  textAlign: "center",
                  fontSize: "12px",
                  border: "1px solid #ccc",
                  borderRadius: "2px"
              });

              // Afficher le maximum disponible si applicable
              const maxInfo = document.createElement("span");
              maxInfo.style.fontSize = "10px";
              maxInfo.style.color = "#999";
              if (sortieBocal && sortieBocal.categorie === "Goutte") {
                  maxInfo.textContent = "max: " + (compositionReference[v.label] || 0);
              } else {
                  maxInfo.textContent = "---";
              }

              inputGroup.appendChild(label);
              inputGroup.appendChild(input);
              inputGroup.appendChild(maxInfo);
              grid.appendChild(inputGroup);
          });

          groupeDiv.appendChild(grid);
          compositionContainer.appendChild(groupeDiv);
      });

      section.appendChild(compositionContainer);
      dynamicContainer.appendChild(section);

      // Fonction pour calculer le total de la composition
      function calculerTotalComposition() {
          const inputs = document.querySelectorAll(".composition-input");
          let total = 0;
          inputs.forEach(function(input) {
              const quantite = parseInt(input.value) || 0;
              const valeur = parseFloat(input.dataset.value) || 0;
              total += quantite * valeur;
          });
          return formatNumber(total);
      }

      // Mettre à jour l'affichage du total
      function updateTotalDisplay() {
          const total = calculerTotalComposition();
          totalDisplay.textContent = "Total: " + formatMoney(total);
          totalDisplay.style.display = "block";
      }

      // Ajouter des écouteurs pour mettre à jour le total
      const inputs = document.querySelectorAll(".composition-input");
      inputs.forEach(function(input) {
          input.addEventListener("input", updateTotalDisplay);
      });

      // Calculer le total initial
      updateTotalDisplay();
  }

  // Fonction pour mettre à jour l'interface selon la sélection
  function updateInterface() {
      const sortieSelected = selectSortie.value !== "";
      const entreeSelected = selectEntree.value !== "";
      const sortieBocal = sortieSelected ? bocaux.find(function(b) { return b.id === selectSortie.value; }) : null;
      const entreeBocal = entreeSelected ? bocaux.find(function(b) { return b.id === selectEntree.value; }) : null;

      errorDiv.style.display = "none";

      // Vérifier les contraintes de base
      if (sortieSelected && entreeSelected && selectSortie.value === selectEntree.value) {
          errorDiv.textContent = "Le conteneur de sortie et d'entrée doivent être différents.";
          errorDiv.style.display = "block";
          creerInterfaceStandard();
          return;
      }

      // Vérifier si au moins une Goutte est impliquée
      const hasGoutte = (sortieBocal && sortieBocal.categorie === "Goutte") || 
                        (entreeBocal && entreeBocal.categorie === "Goutte");

      if (hasGoutte) {
          creerInterfaceAvecComposition();
      } else {
          fenetre.style.width = "360px";
          creerInterfaceStandard();
      }
  }

  // Valider button
  const btnVal = document.createElement("button");
  btnVal.id = "validerVersement";
  btnVal.textContent = "Valider le versement";
  Object.assign(btnVal.style, {
      display: "block", 
      margin: "20px auto 0", 
      padding: "10px 20px",
      borderRadius: "6px", 
      backgroundColor: "black",
      color: "white", 
      border: "none", 
      cursor: "pointer",
      fontWeight: "bold"
  });

  btnVal.addEventListener("click", function(){
      const sortieId = selectSortie.value;
      const entreeId = selectEntree.value;
      const sortieBocal = sortieId ? bocaux.find(function(b) { return b.id === sortieId; }) : null;
      const entreeBocal = entreeId ? bocaux.find(function(b) { return b.id === entreeId; }) : null;

      // Validation de base
      if (!sortieId && !entreeId) {
          errorDiv.textContent = "Veuillez sélectionner au moins un conteneur (sortie ou entrée).";
          errorDiv.style.display = "block";
          return;
      }

      if (sortieId && entreeId && sortieId === entreeId) {
          errorDiv.textContent = "Le conteneur de sortie et d'entrée doivent être différents.";
          errorDiv.style.display = "block";
          return;
      }

      // Vérifier si une Goutte est impliquée
      const hasGoutte = (sortieBocal && sortieBocal.categorie === "Goutte") || 
                        (entreeBocal && entreeBocal.categorie === "Goutte");

      if (hasGoutte) {
          // Mode avec composition
          const inputs = document.querySelectorAll(".composition-input");
          let compositionTransfert = {};
          let totalMontant = 0;

          // Récupérer la composition et calculer le total
          inputs.forEach(function(input) {
              const quantite = parseInt(input.value) || 0;
              const valeur = parseFloat(input.dataset.value) || 0;
              if (quantite > 0) {
                  compositionTransfert[input.dataset.label] = quantite;
                  totalMontant += quantite * valeur;
              }
          });

          // Vérifier qu'au moins une valeur est > 0
          const totalTransfert = Object.values(compositionTransfert).reduce(function(sum, val) { return sum + val; }, 0);
          if (totalTransfert === 0) {
              errorDiv.textContent = "Veuillez saisir au moins une quantité à transférer.";
              errorDiv.style.display = "block";
              return;
          }

          // Vérifier les limites si Goutte en sortie
          if (sortieBocal && sortieBocal.categorie === "Goutte") {
              const idxSortie = bocaux.findIndex(function(b) { return b.id === sortieId; });
              const compositionSortie = (idxSortie !== -1 && bocaux[idxSortie].composition) ? bocaux[idxSortie].composition : {};
              
              let transfertValide = true;
              Object.keys(compositionTransfert).forEach(function(label) {
                  if ((compositionSortie[label] || 0) < compositionTransfert[label]) {
                      transfertValide = false;
                      errorDiv.textContent = "Quantité insuffisante pour " + label + " (disponible: " + (compositionSortie[label] || 0) + ")";
                      errorDiv.style.display = "block";
                      return;
                  }
              });

              if (!transfertValide) return;
          }

          // Vérifier les fonds si sortie non-Goutte
          if (sortieBocal && sortieBocal.categorie !== "Goutte") {
              const bocalSortie = bocalMap.get(sortieId);
              if (bocalSortie) {
                  const investDisponible = bocalSortie._investment || 0;
                  if (totalMontant > investDisponible) {
                      errorDiv.textContent = "Fonds insuffisants en investissement (disponible: " + formatMoney(investDisponible) + ")";
                      errorDiv.style.display = "block";
                      return;
                  }
              }
          }

          // EFFECTUER LE TRANSFERT

          // Traitement de la SORTIE
          if (sortieId) {
              const bocalSortie = bocalMap.get(sortieId);
              if (bocalSortie) {
                  if (sortieBocal.categorie === "Goutte") {
                      // Pour Goutte : soustraire la composition
                      const idxSortie = bocaux.findIndex(function(b) { return b.id === sortieId; });
                      if (idxSortie !== -1) {
                          Object.keys(compositionTransfert).forEach(function(label) {
                              bocaux[idxSortie].composition[label] = (bocaux[idxSortie].composition[label] || 0) - compositionTransfert[label];
                          });
                          // RECALCULER LES TOTAUX
                          recalcGoutteTotals(sortieId);
                      }
                  } else {
                      // Pour non-Goutte : soustraire de l'investissement
                      bocalSortie._investment = formatNumber((bocalSortie._investment || 0) - totalMontant);
                      const idxSortie = bocaux.findIndex(function(b) { return b.id === sortieId; });
                      if (idxSortie !== -1) {
                          bocaux[idxSortie].investment = bocalSortie._investment;
                      }
                  }
                  updateBocalDisplay(bocalSortie);
              }
          }

          // Traitement de l'ENTRÉE
          if (entreeId) {
              const bocalEntree = bocalMap.get(entreeId);
              if (bocalEntree) {
                  if (entreeBocal.categorie === "Goutte") {
                      // Pour Goutte : ajouter la composition
                      const idxEntree = bocaux.findIndex(function(b) { return b.id === entreeId; });
                      if (idxEntree !== -1) {
                          Object.keys(compositionTransfert).forEach(function(label) {
                              bocaux[idxEntree].composition[label] = (bocaux[idxEntree].composition[label] || 0) + compositionTransfert[label];
                          });
                          // RECALCULER LES TOTAUX
                          recalcGoutteTotals(entreeId);
                      }
                  } else {
                      // Pour non-Goutte : ajouter à l'investissement
                      bocalEntree._investment = formatNumber((bocalEntree._investment || 0) + totalMontant);
                      const idxEntree = bocaux.findIndex(function(b) { return b.id === entreeId; });
                      if (idxEntree !== -1) {
                          bocaux[idxEntree].investment = bocalEntree._investment;
                      }
                  }
                  updateBocalDisplay(bocalEntree);
                }
            }

        } else {
            // Mode standard sans Goutte
            const montantInvest = formatNumber(document.getElementById("montant_invest").value) || 0;
            const montantInteret = formatNumber(document.getElementById("montant_interet").value) || 0;

            if (montantInvest <= 0 && montantInteret <= 0) {
                errorDiv.textContent = "Veuillez saisir au moins un montant (investissement ou intérêt).";
                errorDiv.style.display = "block";
                return;
            }

            // Vérifier les fonds disponibles si on retire de la sortie
            if (sortieId) {
                const bocalSortie = bocalMap.get(sortieId);
                if (bocalSortie) {
                    const investDisponible = bocalSortie._investment || 0;
                    const interetDisponible = bocalSortie._interest || 0;

                    if (montantInvest > investDisponible) {
                        errorDiv.textContent = "Fonds insuffisants en investissement (disponible: " + formatMoney(investDisponible) + ")";
                        errorDiv.style.display = "block";
                        return;
                    }

                    if (montantInteret > interetDisponible) {
                        errorDiv.textContent = "Fonds insuffisants en intérêt (disponible: " + formatMoney(interetDisponible) + ")";
                        errorDiv.style.display = "block";
                        return;
                    }
                }
            }

            // Effectuer les opérations standard
            if (sortieId) {
                const bocalSortie = bocalMap.get(sortieId);
                if (bocalSortie) {
                    bocalSortie._investment = formatNumber((bocalSortie._investment || 0) - montantInvest);
                    bocalSortie._interest = formatNumber((bocalSortie._interest || 0) - montantInteret);
                    updateBocalDisplay(bocalSortie);
                }
            }

            if (entreeId) {
                const bocalEntree = bocalMap.get(entreeId);
                if (bocalEntree) {
                    bocalEntree._investment = formatNumber((bocalEntree._investment || 0) + montantInvest);
                    bocalEntree._interest = formatNumber((bocalEntree._interest || 0) + montantInteret);
                    updateBocalDisplay(bocalEntree);
                }
            }
        }

        // Réécrire les paths des conteneurs modifiés
        if (sortieId) {
            const bocalSortie = bocalMap.get(sortieId);
            if (bocalSortie) {
                updateBocalDisplay(bocalSortie);
            }
        }
        if (entreeId) {
            const bocalEntree = bocalMap.get(entreeId);
            if (bocalEntree) {
                updateBocalDisplay(bocalEntree);
            }
        }

        fermerFenetre();
    });

    fenetre.appendChild(btnVal);

    // Écouter les changements de sélection
    selectSortie.addEventListener("change", updateInterface);
    selectEntree.addEventListener("change", updateInterface);

    // Initialiser l'interface
    updateInterface();

    fenetre.style.display = "block";
    fenetre.focus();
}

// ---------------------------
// Fonction pour calculer automatiquement la composition à partir d'un montant
// ---------------------------
function calculerCompositionAutomatique(montant) {
  const composition = {};
  let reste = montant;
  
  // Trier les valeurs par ordre décroissant
  const toutesValeurs = [];
  monnaieValues.forEach(function(groupe) {
    groupe.values.forEach(function(v) {
      toutesValeurs.push({ label: v.label, value: v.value });
    });
  });
  
  toutesValeurs.sort(function(a, b) { return b.value - a.value; });
  
  toutesValeurs.forEach(function(monnaie) {
    if (reste >= monnaie.value) {
      const quantite = Math.floor(reste / monnaie.value);
      composition[monnaie.label] = quantite;
      reste = Math.round((reste - quantite * monnaie.value) * 100) / 100;
    }
  });
  
  return composition;
}

// ---------------------------
// Fenêtre Renommer (pour bocaux)
// ---------------------------
function afficherRenommer(bocalElem) {
  if (!bocalElem) return;
  menuContextuel.style.display = "none";
  clearFenetreContent();
  fenetreHeaderTitle.textContent = "Renommer";
  const nomDiv = findRelatedDiv(bocalElem, "nom");
  const currentName = nomDiv ? nomDiv.textContent : "";

  fenetre.insertAdjacentHTML("beforeend", 
    '<div style="padding:10px;">' +
      '<div style="margin-bottom:8px;">' +
        '<input type="text" id="rename_input" value="' + escapeHtml(currentName) + '" style="width:100%;box-sizing:border-box;padding:8px;">' +
      '</div>' +
      '<div style="text-align:center;">' +
        '<button id="validerRenommer" style="background:black;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Valider</button>' +
      '</div>' +
    '</div>'
  );

  const renInput = document.getElementById("rename_input");
  const valBtn = document.getElementById("validerRenommer");
  renInput.focus();
  valBtn.addEventListener("click", function() {
    const newName = renInput.value.trim();
    if (newName.length === 0) return;
    if (nomDiv) nomDiv.textContent = newName;
    const idx = bocaux.findIndex(function(b){ return b.id === bocalElem._id; });
    if (idx !== -1) {
      bocaux[idx].nom = newName;
      saveBocaux();
      updateTotalPatrimoineVise();
      updateTotalPatrimoineSimule();
    }
    // update selects
    ["select_sortie","select_entree"].forEach(function(selId){
      const sel = document.getElementById(selId);
      if (!sel) return;
      Array.from(sel.options).forEach(function(opt){
        if (opt.value === bocalElem._id) opt.text = newName;
      });
    });
    fermerFenetre();
  });
  fenetre.style.display = "block";
  fenetre.focus();
}

// ---------------------------
// Fenêtre Paramètre (objectif + simulation + catégorie + composition pour Goutte - lecture seule)
// ---------------------------
function afficherParametre(bocalElem, keepObjectif = null, keepSimulation = null) {
  if (!bocalElem) return;
  menuContextuel.style.display = "none";
  clearFenetreContent();
  fenetreHeaderTitle.textContent = "Paramètre";
  
  const objDiv = findRelatedDiv(bocalElem, "objectif");
  const currentObj = keepObjectif !== null ? keepObjectif : (objDiv ? (objDiv.textContent.replace(/\s?€$/, "")||"0") : "0");
  
  const simDiv = findRelatedDiv(bocalElem, "simulation");
  const currentSim = keepSimulation !== null ? keepSimulation : (simDiv ? (simDiv.textContent.replace(/\s?€$/, "")||"0") : "0");
  
  // récupérer la catégorie actuelle
  const idx = bocaux.findIndex(function(b){ return b.id === bocalElem._id; });
  const currentCategorie = (idx !== -1 && bocaux[idx].categorie) ? bocaux[idx].categorie : "Courant";
  const currentComposition = (idx !== -1 && bocaux[idx].composition) ? bocaux[idx].composition : {};
  const currentObjectifDynamique = (idx !== -1 && bocaux[idx].objectifDynamique) ? bocaux[idx].objectifDynamique : false;
  const currentObjectifDynamiqueConfig = (idx !== -1 && bocaux[idx].objectifDynamiqueConfig) ? bocaux[idx].objectifDynamiqueConfig : [];
  const currentSimulationDynamique = (idx !== -1 && bocaux[idx].simulationDynamique) ? bocaux[idx].simulationDynamique : false;
  const currentSimulationDynamiqueConfig = (idx !== -1 && bocaux[idx].simulationDynamiqueConfig) ? bocaux[idx].simulationDynamiqueConfig : [];

  fenetre.style.width = currentCategorie === "Goutte" ? "480px" : "400px";

  let html = 
    '<div style="padding:10px;max-height:500px;overflow-y:auto;">' +
      '<div class="objectif-dynamique-container">' +
        '<div class="objectif-dynamique-label">' +
          '<label style="font-weight:bold;color:#555;" id="objectifLabel">' + 
            (currentObjectifDynamique ? "Objectif Dynamique" : "Objectif") + 
          '</label>' +
          '<input type="checkbox" id="param_objectif_dynamique" class="objectif-dynamique-checkbox" ' + 
                 (currentObjectifDynamique ? 'checked' : '') + '>' +
        '</div>' +
        '<input type="number" id="param_objectif" value="' + escapeHtml(currentObj) + '" step="0.01" style="width:150px;padding:8px;box-sizing:border-box;" ' +
               (currentObjectifDynamique ? 'readonly' : '') + '>' +
      '</div>';

  // Configuration des objectifs dynamiques (affichée seulement si objectif dynamique est activé)
  if (currentObjectifDynamique) {
    html += '<div id="config_dynamique_container" class="config-dynamique-container">' +
      '<div class="config-dynamique-header">' +
        '<div class="config-dynamique-title">Configuration Objectif</div>' +
        '<button id="ajouter_conteneur_btn" class="ajouter-conteneur-btn">+ Ajouter</button>' +
      '</div>' +
      '<div id="lignes_conteneurs_objectif"></div>' +
      '<div id="total_dynamique_objectif" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
    '</div>';
  }

  html += '<div class="simulation-dynamique-container" style="margin-top:20px;">' +
        '<div class="simulation-dynamique-label">' +
          '<label style="font-weight:bold;color:#555;" id="simulationLabel">' + 
            (currentSimulationDynamique ? "Simulation Dynamique" : "Simulation") + 
          '</label>' +
          '<input type="checkbox" id="param_simulation_dynamique" class="simulation-dynamique-checkbox" ' + 
                 (currentSimulationDynamique ? 'checked' : '') + '>' +
        '</div>' +
        '<input type="number" id="param_simulation" value="' + escapeHtml(currentSim) + '" step="0.01" style="width:150px;padding:8px;box-sizing:border-box;" ' +
               (currentSimulationDynamique ? 'readonly' : '') + '>' +
      '</div>';

  // Configuration des simulations dynamiques (affichée seulement si simulation dynamique est activé)
  if (currentSimulationDynamique) {
    html += '<div id="config_simulation_container" class="config-dynamique-container" style="margin-top:10px;">' +
      '<div class="config-dynamique-header">' +
        '<div class="config-dynamique-title">Configuration Simulation</div>' +
        '<button id="ajouter_conteneur_simulation_btn" class="ajouter-conteneur-btn">+ Ajouter</button>' +
      '</div>' +
      '<div id="lignes_conteneurs_simulation"></div>' +
      '<div id="total_dynamique_simulation" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
    '</div>';
  }

  html += '<div style="margin-bottom:12px;margin-top:20px;">' +
        '<label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Catégorie</label>' +
        '<select id="param_categorie" style="width:100%;box-sizing:border-box;padding:8px;">' +
          '<option value="Goutte" ' + (currentCategorie === "Goutte" ? "selected" : "") + '>Goutte</option>' +
          '<option value="Courant" ' + (currentCategorie === "Courant" ? "selected" : "") + '>Courant</option>' +
          '<option value="Océan" ' + (currentCategorie === "Océan" ? "selected" : "") + '>Océan</option>' +
          '<option value="Fuite" ' + (currentCategorie === "Fuite" ? "selected" : "") + '>Fuite</option>' +
        '</select>' +
      '</div>';

  // Si catégorie Fuite, afficher montant et période
  if (currentCategorie === "Fuite") {
    const currentMontant = (idx !== -1 && bocaux[idx].montantFuite) ? bocaux[idx].montantFuite : 0;
    const currentPeriode = (idx !== -1 && bocaux[idx].periodeFuite) ? bocaux[idx].periodeFuite : "Mensuel";
    
    html += '<div style="margin-bottom:12px;">' +
        '<label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Montant</label>' +
        '<div style="display:flex;align-items:center;">' +
          '<input type="number" id="param_montant_fuite" value="' + currentMontant + '" step="0.01" min="0" style="flex:1;padding:8px;box-sizing:border-box;">' +
          '<span style="margin-left:8px;font-weight:bold;color:#555;">€</span>' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<label style="display:block;margin-bottom:4px;font-weight:bold;color:#555;">Période</label>' +
        '<select id="param_periode_fuite" style="width:100%;box-sizing:border-box;padding:8px;">';
    
    periodesFuite.forEach(function(p) {
      html += '<option value="' + p + '" ' + (currentPeriode === p ? "selected" : "") + '>' + p + '</option>';
    });
    
    html += '</select>' +
      '</div>';
  }
  
  if (currentCategorie === "Goutte") {
    let totalBillets = 0, totalPieces = 0;
    Object.keys(currentComposition).forEach(function(label) {
      const qty = currentComposition[label] || 0;
      const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
      if (valInfo) {
        const montant = qty * valInfo.value;
        if (label === "5€" || label === "10€" || label === "20€" || label === "50€") totalBillets += montant;
        else totalPieces += montant;
      }
    });
    let infoHtml = '';
  if (currentCategorie === "Goutte") {
    let totalBillets = 0, totalPieces = 0;
    Object.keys(currentComposition).forEach(function(label) {
      const qty = currentComposition[label] || 0;
      const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
      if (valInfo) {
        const montant = qty * valInfo.value;
        if (label === "5€" || label === "10€" || label === "20€" || label === "50€") totalBillets += montant;
        else totalPieces += montant;
      }
    });
    infoHtml = '<div style="margin-top:20px;padding:8px;background:#e8f5e9;border-radius:4px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
        '<span style="color:#007BFF;font-weight:bold;">Billets:</span>' +
        '<span style="color:#007BFF;font-weight:bold;">' + formatMoney(totalBillets) + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
        '<span style="color:#D79A10;font-weight:bold;">Pièces:</span>' +
        '<span style="color:#D79A10;font-weight:bold;">' + formatMoney(totalPieces) + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;border-top:1px solid #ccc;padding-top:4px;margin-top:4px;">' +
        '<span style="color:#2ecc71;font-weight:bold;">Total:</span>' +
        '<span style="color:#2ecc71;font-weight:bold;">' + formatMoney(totalBillets + totalPieces) + '</span>' +
      '</div></div>';
  } else if (currentCategorie === "Fuite") {
    const inv = (idx !== -1) ? (bocaux[idx].investment || 0) : 0;
    infoHtml = '<div style="margin-top:20px;padding:8px;background:#e8f5e9;border-radius:4px;">' +
      '<div style="display:flex;justify-content:space-between;">' +
        '<span style="color:#007BFF;font-weight:bold;">Investissement:</span>' +
        '<span style="color:#007BFF;font-weight:bold;">' + formatMoney(inv) + '</span>' +
      '</div></div>';
  } else {
    const inv  = (idx !== -1) ? (bocaux[idx].investment || 0) : 0;
    const intr = (idx !== -1) ? (bocaux[idx].interest   || 0) : 0;
    infoHtml = '<div style="margin-top:20px;padding:8px;background:#e8f5e9;border-radius:4px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
        '<span style="color:#007BFF;font-weight:bold;">Investissement:</span>' +
        '<span style="color:#007BFF;font-weight:bold;">' + formatMoney(inv) + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
        '<span style="color:#D79A10;font-weight:bold;">Intérêts:</span>' +
        '<span style="color:#D79A10;font-weight:bold;">' + formatMoney(intr) + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;border-top:1px solid #ccc;padding-top:4px;margin-top:4px;">' +
        '<span style="color:#2ecc71;font-weight:bold;">Capital:</span>' +
        '<span style="color:#2ecc71;font-weight:bold;">' + formatMoney(inv + intr) + '</span>' +
      '</div></div>';
  }
  html += infoHtml;
  html += '<div style="text-align:center;margin-top:16px;">' +
        '<button id="validerParam" style="background:black;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Valider</button>' +
      '</div>' +
    '</div>';

  fenetre.insertAdjacentHTML("beforeend", html);

  const inputObj = document.getElementById("param_objectif");
  const inputSim = document.getElementById("param_simulation");
  const selectCat = document.getElementById("param_categorie");
  const checkboxDynamique = document.getElementById("param_objectif_dynamique");
  const checkboxSimulationDynamique = document.getElementById("param_simulation_dynamique");
  const labelObjectif = document.getElementById("objectifLabel");
  const labelSimulation = document.getElementById("simulationLabel");
  const valBtn = document.getElementById("validerParam");

  // Fonction pour créer une ligne de configuration de conteneur
  function creerLigneConteneur(containerId, type = "objectif", config = null) {
    const lignesConteneurs = document.getElementById(containerId);
    const ligneDiv = document.createElement("div");
    ligneDiv.className = "ligne-conteneur";
    
    // Select pour choisir le conteneur
    const select = document.createElement("select");
    select.className = "select-conteneur";
    select.appendChild(new Option("Sélectionner un conteneur", ""));
    
    // Filtrer les bocaux pour exclure le bocal actuel
    const autresBocaux = bocaux.filter(function(b) {
      return b.id !== bocalElem._id;
    });
    
    autresBocaux.forEach(function(b) {
      select.appendChild(new Option(b.nom, b.id));
    });
    
    // Input pour le pourcentage
    const inputPourcentage = document.createElement("input");
    inputPourcentage.type = "number";
    inputPourcentage.className = "pourcentage-input";
    inputPourcentage.placeholder = "0%";
    inputPourcentage.min = "0";
    inputPourcentage.max = "100";
    inputPourcentage.step = "1";
    
    // Bouton de suppression
    const btnSupprimer = document.createElement("button");
    btnSupprimer.className = "supprimer-ligne-btn";
    btnSupprimer.textContent = "×";
    btnSupprimer.title = "Supprimer cette ligne";
    
    // Remplir avec les valeurs existantes si config fournie
    if (config) {
      select.value = config.bocalId || "";
      inputPourcentage.value = config.pourcentage || "";
    }
    
    // Événements
    select.addEventListener("change", function() {
      if (type === "simulation") {
        calculerTotalDynamique("config_simulation_container", "param_simulation", "simulation");
      } else {
        calculerTotalDynamique("config_dynamique_container", "param_objectif", "objectif");
      }
    });
    inputPourcentage.addEventListener("input", function() {
      if (type === "simulation") {
        calculerTotalDynamique("config_simulation_container", "param_simulation", "simulation");
      } else {
        calculerTotalDynamique("config_dynamique_container", "param_objectif", "objectif");
      }
    });
    btnSupprimer.addEventListener("click", function() {
      ligneDiv.remove();
      if (type === "simulation") {
        calculerTotalDynamique("config_simulation_container", "param_simulation", "simulation");
      } else {
        calculerTotalDynamique("config_dynamique_container", "param_objectif", "objectif");
      }
    });
    
    ligneDiv.appendChild(select);
    ligneDiv.appendChild(inputPourcentage);
    ligneDiv.appendChild(document.createTextNode("%"));
    ligneDiv.appendChild(btnSupprimer);
    lignesConteneurs.appendChild(ligneDiv);
    
    return ligneDiv;
  }

  // Fonction pour calculer le total dynamique
  function calculerTotalDynamique(configContainerId, inputId, type = "objectif") {
    const lignes = document.querySelectorAll("#" + configContainerId + " .ligne-conteneur");
    let total = 0;
    
    lignes.forEach(function(ligne) {
      const select = ligne.querySelector(".select-conteneur");
      const input = ligne.querySelector(".pourcentage-input");
      
      if (select.value && input.value) {
        const bocalId = select.value;
        const pourcentage = parseFloat(input.value) || 0;
        const bocal = bocaux.find(function(b) { return b.id === bocalId; });
        
        if (bocal) {
          let capital = 0;
          
          // MODIFICATION IMPORTANTE: Pour les simulations dynamiques, utiliser la simulation
          if (type === "simulation") {
            // Pour les simulations dynamiques, utiliser la valeur de simulation du bocal
            capital = bocal.simulation || 0;
          } else {
            // Pour les objectifs dynamiques, utiliser le capital (comme avant)
            if (bocal.categorie === "Goutte") {
              if (bocal.composition) {
                Object.keys(bocal.composition).forEach(function(label) {
                  const qty = bocal.composition[label] || 0;
                  const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
                  if (valInfo) {
                    capital += qty * valInfo.value;
                  }
                });
              }
            } else if (bocal.categorie === "Fuite") {
              capital = bocal.investment || 0;
            } else {
              capital = (bocal.investment || 0) + (bocal.interest || 0);
            }
          }
          
          total += capital * (pourcentage / 100);
        }
      }
    });
    
    const totalDisplay = document.getElementById(configContainerId === "config_simulation_container" ? 
      "total_dynamique_simulation" : "total_dynamique_objectif");
    if (totalDisplay) {
      totalDisplay.textContent = "Total: " + formatMoney(total);
    }
    
    // Mettre à jour l'input correspondant
    const input = document.getElementById(inputId);
    if (input) {
      input.value = formatNumber(total);
    }
  }

  // Initialiser la configuration dynamique objectif si activée
  if (currentObjectifDynamique) {
    // Créer les lignes existantes
    if (currentObjectifDynamiqueConfig.length > 0) {
      currentObjectifDynamiqueConfig.forEach(function(config) {
        creerLigneConteneur("lignes_conteneurs_objectif", "objectif", config);
      });
    } else {
      // Créer une ligne vide par défaut
      creerLigneConteneur("lignes_conteneurs_objectif", "objectif");
    }
    
    // Calculer le total initial
    calculerTotalDynamique("config_dynamique_container", "param_objectif", "objectif");
    
    // Bouton pour ajouter une ligne
    const btnAjouter = document.getElementById("ajouter_conteneur_btn");
    if (btnAjouter) {
      btnAjouter.addEventListener("click", function() {
        creerLigneConteneur("lignes_conteneurs_objectif", "objectif");
      });
    }
  }

  // Initialiser la configuration dynamique simulation si activée
  if (currentSimulationDynamique) {
    // Créer les lignes existantes
    if (currentSimulationDynamiqueConfig.length > 0) {
      currentSimulationDynamiqueConfig.forEach(function(config) {
        creerLigneConteneur("lignes_conteneurs_simulation", "simulation", config);
      });
    } else {
      // Créer une ligne vide par défaut
      creerLigneConteneur("lignes_conteneurs_simulation", "simulation");
    }
    
    // Calculer le total initial
    calculerTotalDynamique("config_simulation_container", "param_simulation", "simulation");
    
    // Bouton pour ajouter une ligne
    const btnAjouterSimulation = document.getElementById("ajouter_conteneur_simulation_btn");
    if (btnAjouterSimulation) {
      btnAjouterSimulation.addEventListener("click", function() {
        creerLigneConteneur("lignes_conteneurs_simulation", "simulation");
      });
    }
  }

  // Gérer le changement de la case à cocher objectif dynamique
  checkboxDynamique.addEventListener("change", function() {
    if (this.checked) {
      labelObjectif.textContent = "Objectif Dynamique";
      inputObj.readOnly = true;
      inputObj.style.backgroundColor = "#f5f5f5";
      inputObj.style.color = "#666";
      
      // Afficher la configuration
      if (!document.getElementById("config_dynamique_container")) {
        const configHtml = '<div id="config_dynamique_container" class="config-dynamique-container">' +
          '<div class="config-dynamique-header">' +
            '<div class="config-dynamique-title">Configuration Objectif</div>' +
            '<button id="ajouter_conteneur_btn" class="ajouter-conteneur-btn">+ Ajouter</button>' +
          '</div>' +
          '<div id="lignes_conteneurs_objectif"></div>' +
          '<div id="total_dynamique_objectif" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
        '</div>';
        
        const objectifContainer = document.querySelector(".objectif-dynamique-container");
        objectifContainer.insertAdjacentHTML("afterend", configHtml);
        
        // Initialiser la configuration
        creerLigneConteneur("lignes_conteneurs_objectif", "objectif");
        calculerTotalDynamique("config_dynamique_container", "param_objectif", "objectif");
        
        const btnAjouter = document.getElementById("ajouter_conteneur_btn");
        btnAjouter.addEventListener("click", function() {
          creerLigneConteneur("lignes_conteneurs_objectif", "objectif");
        });
      }
    } else {
      labelObjectif.textContent = "Objectif";
      inputObj.readOnly = false;
      inputObj.style.backgroundColor = "";
      inputObj.style.color = "";
      
      // Cacher la configuration
      const configContainer = document.getElementById("config_dynamique_container");
      if (configContainer) {
        configContainer.remove();
      }
    }
  });

  // Gérer le changement de la case à cocher simulation dynamique
  checkboxSimulationDynamique.addEventListener("change", function() {
    if (this.checked) {
      labelSimulation.textContent = "Simulation Dynamique";
      inputSim.readOnly = true;
      inputSim.style.backgroundColor = "#f5f5f5";
      inputSim.style.color = "#666";
      
      // Afficher la configuration
      if (!document.getElementById("config_simulation_container")) {
        const configHtml = '<div id="config_simulation_container" class="config-dynamique-container" style="margin-top:10px;">' +
          '<div class="config-dynamique-header">' +
            '<div class="config-dynamique-title">Configuration Simulation</div>' +
            '<button id="ajouter_conteneur_simulation_btn" class="ajouter-conteneur-btn">+ Ajouter</button>' +
          '</div>' +
          '<div id="lignes_conteneurs_simulation"></div>' +
          '<div id="total_dynamique_simulation" class="total-dynamique">Total: ' + formatMoney(0) + '</div>' +
        '</div>';
        
        const simulationContainer = document.querySelector(".simulation-dynamique-container");
        simulationContainer.insertAdjacentHTML("afterend", configHtml);
        
        // Initialiser la configuration
        creerLigneConteneur("lignes_conteneurs_simulation", "simulation");
        calculerTotalDynamique("config_simulation_container", "param_simulation", "simulation");
        
        const btnAjouter = document.getElementById("ajouter_conteneur_simulation_btn");
        btnAjouter.addEventListener("click", function() {
          creerLigneConteneur("lignes_conteneurs_simulation", "simulation");
        });
      }
    } else {
      labelSimulation.textContent = "Simulation";
      inputSim.readOnly = false;
      inputSim.style.backgroundColor = "";
      inputSim.style.color = "";
      
      // Cacher la configuration
      const configContainer = document.getElementById("config_simulation_container");
      if (configContainer) {
        configContainer.remove();
      }
    }
  });

  // Recréer l'interface si on change de catégorie (en gardant l'objectif et la simulation)
  selectCat.addEventListener("change", function() {
    const currentObjValue = inputObj.value;
    const currentSimValue = inputSim.value;
    const currentObjDynamique = checkboxDynamique.checked;
    const currentSimDynamique = checkboxSimulationDynamique.checked;
    const newCategorie = selectCat.value;
    const oldCategorie = currentCategorie;
    const idx = bocaux.findIndex(function(b){ return b.id === bocalElem._id; });
    
    // Calculer le capital actuel
    const currentInv = bocalElem._investment || 0;
    const currentInt = bocalElem._interest || 0;
    let currentCapital = 0;
    
    if (oldCategorie === "Fuite") {
      currentCapital = currentInv;
    } else {
      currentCapital = currentInv + currentInt;
    }
    
    // Gérer la transition de catégorie
    if (oldCategorie === "Goutte" && newCategorie !== "Goutte") {
      // Goutte → autre : Capital (billets + pièces) → investissement, intérêts = 0
      bocalElem._investment = formatNumber(currentCapital);
      bocalElem._interest = 0;
      if (idx !== -1) {
        bocaux[idx].investment = formatNumber(currentCapital);
        bocaux[idx].interest = 0;
        bocaux[idx].composition = {};
      }
    } else if (oldCategorie !== "Goutte" && newCategorie === "Goutte") {
      // Autre → Goutte : Convertir l'investissement en composition
      const composition = calculerCompositionAutomatique(currentCapital);
      
      bocalElem._investment = 0;
      bocalElem._interest = 0;
      if (idx !== -1) {
        bocaux[idx].investment = 0;
        bocaux[idx].interest = 0;
        bocaux[idx].composition = composition;
        
        // Calculer billets/pièces
        let totalBillets = 0;
        let totalPieces = 0;
        Object.keys(composition).forEach(function(label) {
          const qty = composition[label];
          const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
          if (valInfo) {
            const montant = qty * valInfo.value;
            if (label === "5€" || label === "10€" || label === "20€" || label === "50€") {
              totalBillets += montant;
            } else {
              totalPieces += montant;
            }
          }
        });
        bocalElem._investment = formatNumber(totalBillets);
        bocalElem._interest = formatNumber(totalPieces);
        bocaux[idx].investment = formatNumber(totalBillets);
        bocaux[idx].interest = formatNumber(totalPieces);
      }
    } else if ((oldCategorie === "Courant" || oldCategorie === "Océan") && newCategorie === "Fuite") {
      // Courant/Océan → Fuite : Capital (inv + int) → investissement
      bocalElem._investment = formatNumber(currentCapital);
      bocalElem._interest = 0;
      if (idx !== -1) {
        bocaux[idx].investment = formatNumber(currentCapital);
        bocaux[idx].interest = 0;
      }
    } else if (oldCategorie === "Fuite" && (newCategorie === "Courant" || newCategorie === "Océan")) {
      // Fuite → Courant/Océan : investissement reste, intérêts = 0
      // (déjà le cas, rien à faire)
    }
    
    if (idx !== -1) {
      bocaux[idx].categorie = newCategorie;
    }
    
    afficherParametre(bocalElem, currentObjValue, currentSimValue);
  });

  inputObj.focus();
  valBtn.addEventListener("click", function(){
    const objectifDynamique = checkboxDynamique.checked;
    const simulationDynamique = checkboxSimulationDynamique.checked;
    
    let objectifFinal = 0;
    let objectifDynamiqueConfig = [];
    let simulationFinal = 0;
    let simulationDynamiqueConfig = [];
    
    // Gérer l'objectif
    if (objectifDynamique) {
      // Récupérer la configuration des objectifs dynamiques
      const lignes = document.querySelectorAll("#config_dynamique_container .ligne-conteneur");
      lignes.forEach(function(ligne) {
        const select = ligne.querySelector(".select-conteneur");
        const input = ligne.querySelector(".pourcentage-input");
        
        if (select.value && input.value) {
          objectifDynamiqueConfig.push({
            bocalId: select.value,
            pourcentage: parseFloat(input.value) || 0
          });
        }
      });
      
      // Calculer l'objectif final
      objectifFinal = formatNumber(inputObj.value);
    } else {
      const v = formatNumber(inputObj.value);
      if (isNaN(v)) return;
      objectifFinal = v;
    }
    
    // Gérer la simulation
    if (simulationDynamique) {
      // Récupérer la configuration des simulations dynamiques
      const lignes = document.querySelectorAll("#config_simulation_container .ligne-conteneur");
      lignes.forEach(function(ligne) {
        const select = ligne.querySelector(".select-conteneur");
        const input = ligne.querySelector(".pourcentage-input");
        
        if (select.value && input.value) {
          simulationDynamiqueConfig.push({
            bocalId: select.value,
            pourcentage: parseFloat(input.value) || 0
          });
        }
      });
      
      // Calculer la simulation finale
      simulationFinal = formatNumber(inputSim.value);
    } else {
      const v = formatNumber(inputSim.value);
      if (isNaN(v)) return;
      simulationFinal = v;
    }
    
    if (objDiv) objDiv.textContent = formatMoney(objectifFinal);
    if (simDiv) simDiv.textContent = formatMoney(simulationFinal);
    
    const categorie = selectCat.value;
    const idx = bocaux.findIndex(function(b){ return b.id === bocalElem._id; });
    if (idx !== -1) {
      bocaux[idx].objectif = objectifFinal;
      bocaux[idx].simulation = simulationFinal;
      bocaux[idx].categorie = categorie;
      bocaux[idx].objectifDynamique = objectifDynamique;
      bocaux[idx].objectifDynamiqueConfig = objectifDynamiqueConfig;
      bocaux[idx].simulationDynamique = simulationDynamique;
      bocaux[idx].simulationDynamiqueConfig = simulationDynamiqueConfig;
      
      // Sauvegarder les paramètres pour Fuite
      if (categorie === "Fuite") {
        const montantInput = document.getElementById("param_montant_fuite");
        const periodeInput = document.getElementById("param_periode_fuite");
        if (montantInput && periodeInput) {
          bocaux[idx].montantFuite = formatNumber(montantInput.value);
          bocaux[idx].periodeFuite = periodeInput.value;
          // Pour Fuite, interest stocke le montant (mais pas dans le capital)
          bocalElem._interest = formatNumber(bocaux[idx].montantFuite);
          bocaux[idx].interest = formatNumber(bocaux[idx].montantFuite);
        }
      }
      
      saveBocaux();
    }
    
    // appliquer l'emoji selon la catégorie
    applyCategorieEmoji(bocalElem, categorie);
    
    updateBocalDisplay(bocalElem);
    fenetre.style.width = "360px"; // reset width
    fermerFenetre();
  });

  fenetre.style.display = "block";
  fenetre.focus();
}

// ---------------------------
// Navigation entre Home et Main
// ---------------------------
let homePage, mainPage, monthPage;

  function createPages() {
  // Page principale (conteneurs)
  mainPage = document.createElement("div");
  mainPage.id = "mainPage";
  mainPage.style.display = "none";
  
  // Page home
  homePage = document.createElement("div");
  homePage.id = "homePage";
  Object.assign(homePage.style, {
    display: "flex",
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    backgroundColor: "#f2f2f2",
    zIndex: 30000,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center", // Centrer verticalement
    fontFamily: "Arial, sans-serif"
  });
  
  // Conteneur principal pour logo + titre + slogan
  const mainContainer = document.createElement("div");
  Object.assign(mainContainer.style, {
    display: "flex",
    flexDirection: "row", // Logo à gauche, texte à droite
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "60px",
    width: "100%",
    maxWidth: "700px",
    padding: "0 20px"
  });
  
  // Logo
  const logoContainer = document.createElement("div");
  Object.assign(logoContainer.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "140px",
    height: "140px",
    borderRadius: "20px",
    backgroundColor: "white",
    boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
    overflow: "hidden",
    marginRight: "40px",
    flexShrink: "0"
  });
  
  const logoImg = document.createElement("img");
  logoImg.alt = "Logo Flamel Fluid";
  Object.assign(logoImg.style, {
    maxWidth: "100px",
    maxHeight: "100px",
    display: "block"
  });
  
  // Chercher le logo dans le même dossier
  const tryFiles = ["Logo.png", "Logo.jpg", "Logo.jpeg", "Logo.svg", "Logo.gif", "logo.png", "logo.jpg", "logo.jpeg", "logo.svg", "logo.gif"];
  let tryIndex = 0;

  function tryNextLogoHome() {
    if (tryIndex >= tryFiles.length) {
      // Si aucun logo trouvé, utiliser un placeholder stylé
      logoImg.style.display = "none";
      const placeholder = document.createElement("div");
      placeholder.innerHTML = "💧";
      Object.assign(placeholder.style, {
        fontSize: "64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%"
      });
      logoContainer.appendChild(placeholder);
      return;
    }
    
    const file = tryFiles[tryIndex++];
    const path = file; // Utiliser le chemin relatif (même dossier)
    
    const tester = new Image();
    tester.onload = function() {
      logoImg.src = path;
      logoImg.style.display = "block";
      const ph = logoContainer.querySelector(".logo-placeholder");
      if (ph) ph.remove();
    };
    tester.onerror = function() {
      tryNextLogoHome();
    };
    tester.src = path;
  }

  tryNextLogoHome();
  
  logoContainer.appendChild(logoImg);
  
  // Conteneur pour le titre et le slogan (à droite du logo)
  const textContainer = document.createElement("div");
  Object.assign(textContainer.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center"
  });
  
  // Nom de l'application
  const appName = document.createElement("h1");
  appName.textContent = "Flamel Fluid";
  Object.assign(appName.style, {
    fontSize: "48px",
    color: "#333",
    fontWeight: "bold",
    margin: "0 0 12px 0",
    textAlign: "left",
    letterSpacing: "1px"
  });
  
  // Nouveau slogan plus percutant
  const appSubtitle = document.createElement("p");
  appSubtitle.textContent = "Fluidifier votre patrimoine";
  Object.assign(appSubtitle.style, {
    fontSize: "20px",
    color: "#666",
    margin: "0",
    textAlign: "left",
    maxWidth: "400px",
    lineHeight: "1.4",
    fontStyle: "italic"
  });
  
  textContainer.appendChild(appName);
  textContainer.appendChild(appSubtitle);
  
  mainContainer.appendChild(logoContainer);
  mainContainer.appendChild(textContainer);
  
  // Zone des boutons en bas
  const buttonsContainer = document.createElement("div");
  Object.assign(buttonsContainer.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    width: "100%",
    maxWidth: "320px"
  });
  
  // Bouton Main
  const mainButton = document.createElement("button");
  mainButton.textContent = "Main";
  mainButton.className = "home-button main-button";
  Object.assign(mainButton.style, {
    padding: "18px 36px",
    fontSize: "22px",
    backgroundColor: "black",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "bold",
    width: "100%",
    boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
    transition: "all 0.3s ease",
    letterSpacing: "1px"
  });
  
  mainButton.addEventListener("click", function() {
    goToMain();
  });
  
  mainButton.addEventListener("mouseenter", function() {
    mainButton.style.backgroundColor = "#333";
    mainButton.style.transform = "translateY(-2px)";
    mainButton.style.boxShadow = "0 6px 12px rgba(0,0,0,0.25)";
  });
  
  mainButton.addEventListener("mouseleave", function() {
    mainButton.style.backgroundColor = "black";
    mainButton.style.transform = "translateY(0)";
    mainButton.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
  });
  
  mainButton.addEventListener("mousedown", function() {
    mainButton.style.transform = "translateY(1px)";
    mainButton.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
  });
  
  // Bouton Month
  const monthButton = document.createElement("button");
  monthButton.textContent = "Month";
  monthButton.className = "home-button month-button";
  Object.assign(monthButton.style, {
    padding: "18px 36px",
    fontSize: "22px",
    backgroundColor: "black",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "bold",
    width: "100%",
    boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
    transition: "all 0.3s ease",
    letterSpacing: "1px"
  });
  
  monthButton.addEventListener("click", function() {
    goToMonth();
  });
  
  monthButton.addEventListener("mouseenter", function() {
    monthButton.style.backgroundColor = "#333";
    monthButton.style.transform = "translateY(-2px)";
    monthButton.style.boxShadow = "0 6px 12px rgba(0,0,0,0.25)";
  });
  
  monthButton.addEventListener("mouseleave", function() {
    monthButton.style.backgroundColor = "black";
    monthButton.style.transform = "translateY(0)";
    monthButton.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
  });
  
  monthButton.addEventListener("mousedown", function() {
    monthButton.style.transform = "translateY(1px)";
    monthButton.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
  });
  
  // Bouton Matrix
  const matrixButton = document.createElement("button");
  matrixButton.textContent = "Matrix";
  matrixButton.className = "home-button matrix-button";
  Object.assign(matrixButton.style, {
    padding: "18px 36px",
    fontSize: "22px",
    backgroundColor: "black",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "bold",
    width: "100%",
    boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
    transition: "all 0.3s ease",
    letterSpacing: "1px"
  });
  
  matrixButton.addEventListener("click", function() {
    // Ouvrir la feuille Google Sheets dans un nouvel onglet
    window.open("https://docs.google.com/spreadsheets/d/1X0qlMK5ycdvhQ66kEA14vLbnwD0cLkbHguSKiNmnkDI/edit?usp=sharing", "_blank");
  });
  
  matrixButton.addEventListener("mouseenter", function() {
    matrixButton.style.backgroundColor = "#333";
    matrixButton.style.transform = "translateY(-2px)";
    matrixButton.style.boxShadow = "0 6px 12px rgba(0,0,0,0.25)";
  });
  
  matrixButton.addEventListener("mouseleave", function() {
    matrixButton.style.backgroundColor = "black";
    matrixButton.style.transform = "translateY(0)";
    matrixButton.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
  });
  
  matrixButton.addEventListener("mousedown", function() {
    matrixButton.style.transform = "translateY(1px)";
    matrixButton.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
  });
  
  // Assembler les boutons (SUPPRIMER la phrase d'information)
  buttonsContainer.appendChild(mainButton);
  buttonsContainer.appendChild(monthButton);
  buttonsContainer.appendChild(matrixButton);
  // Supprimé: buttonsContainer.appendChild(infoText);
  
  // Ajouter tout au Home
  homePage.appendChild(mainContainer);
  homePage.appendChild(buttonsContainer);
  document.body.appendChild(homePage);
  
  // Créer la page Month
  createMonthPage();
}

function createMonthPage() {
  // Page Month
  monthPage = document.createElement("div");
  monthPage.id = "monthPage";
  Object.assign(monthPage.style, {
    display: "none",
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    backgroundColor: "#f2f2f2",
    zIndex: 30000,
    flexDirection: "column"
  });
  
  // Logo cliquable pour revenir au Home
  const logoContainer = document.createElement("div");
  Object.assign(logoContainer.style, {
    position: "absolute",
    top: "12px",
    right: "12px",
    zIndex: 20000,
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    pointerEvents: "auto",
    cursor: "pointer",
    borderRadius: "8px",
    transition: "all 0.2s ease"
  });
  
  logoContainer.addEventListener("click", function() {
    goToHome();
  });
  
  logoContainer.addEventListener("mouseenter", function() {
    logoContainer.style.backgroundColor = "rgba(0,0,0,0.05)";
  });
  
  logoContainer.addEventListener("mouseleave", function() {
    logoContainer.style.backgroundColor = "transparent";
  });
  
  // Image du logo
  const logoImg = document.createElement("img");
  logoImg.alt = "Logo";
  Object.assign(logoImg.style, {
    maxWidth: "64px",
    maxHeight: "64px",
    display: "block",
    borderRadius: "6px"
  });
  
  // Charger le logo - MODIFIÉ : même logique que setupLogo()
  const tryFiles = ["Logo.png", "Logo.jpg", "Logo.jpeg", "Logo.svg", "Logo.gif", "logo.png", "logo.jpg", "logo.jpeg", "logo.svg", "logo.gif"];
  let tryIndex = 0;

  function tryNextLogoMonth() {
    if (tryIndex >= tryFiles.length) {
      logoImg.style.display = "none";
      let ph = document.createElement("div");
      ph.className = "logo-placeholder";
      ph.textContent = "🏠 Home";
      Object.assign(ph.style, {
        color: "#000",
        background: "#fff",
        border: "1px solid #ccc",
        padding: "8px 12px",
        borderRadius: "6px",
        fontWeight: "bold",
        fontSize: "14px"
      });
      logoContainer.appendChild(ph);
      return;
    }
    const file = tryFiles[tryIndex++];
    const path = file; // Utiliser le chemin relatif (même dossier)
    
    const tester = new Image();
    tester.onload = function() {
      logoImg.src = path;
      logoImg.style.display = "block";
      const ph = logoContainer.querySelector(".logo-placeholder");
      if (ph) ph.remove();
    };
    tester.onerror = function() {
      tryNextLogoMonth();
    };
    tester.src = path;
  }

  tryNextLogoMonth();
  
  logoContainer.appendChild(logoImg);
  monthPage.appendChild(logoContainer);
  
  // Contenu de la page Month
  const contentContainer = document.createElement("div");
  Object.assign(contentContainer.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: "20px",
    textAlign: "center"
  });
  
  const monthIcon = document.createElement("div");
  monthIcon.innerHTML = "📅";
  Object.assign(monthIcon.style, {
    fontSize: "80px",
    marginBottom: "20px"
  });
  
  const title = document.createElement("h1");
  title.textContent = "Month View";
  Object.assign(title.style, {
    fontSize: "36px",
    color: "#333",
    marginBottom: "10px"
  });
  
  const message = document.createElement("p");
  message.textContent = "Vue mensuelle en développement";
  Object.assign(message.style, {
    fontSize: "16px",
    color: "#666",
    maxWidth: "400px",
    lineHeight: "1.5"
  });
  
  contentContainer.appendChild(monthIcon);
  contentContainer.appendChild(title);
  contentContainer.appendChild(message);
  monthPage.appendChild(contentContainer);
  
  document.body.appendChild(monthPage);
}

function goToHome() {
  if (!homePage) createPages();
  mainPage.style.display = "none";
  monthPage.style.display = "none";
  homePage.style.display = "flex";
}

function goToMain() {
  if (!homePage) createPages();
  homePage.style.display = "none";
  monthPage.style.display = "none";
  mainPage.style.display = "block";
}

function goToMonth() {
  if (!monthPage) createMonthPage();
  homePage.style.display = "none";
  mainPage.style.display = "none";
  monthPage.style.display = "flex";
}

// Initialiser les pages au chargement
window.addEventListener("load", function() {
  createPages();
  loadBocaux();
  initMission(); 
  loadMission();
});

// ---------------------------
// Utilitaires
// ---------------------------

// Émojis des catégories
const categorieEmojis = {
  "Goutte": "💧",
  "Courant": "💦",
  "Océan": "🌊",
  "Fuite": "🚰"
};

// Périodes pour Fuite
const periodesFuite = [
  "Quotidien",
  "Hebdomadaire",
  "Bimensuel",
  "Mensuel",
  "Bimestriel",
  "Trimestriel",
  "Quadrimestriel",
  "Semestriel",
  "Annuel"
];

// Valeurs de monnaie pour les bocaux Goutte
const monnaieValues = [
  { groupe: "Centimes rouges", values: [
    { label: "1¢", value: 0.01 },
    { label: "2¢", value: 0.02 },
    { label: "5¢", value: 0.05 }
  ]},
  { groupe: "Centimes jaunes", values: [
    { label: "10¢", value: 0.10 },
    { label: "20¢", value: 0.20 },
    { label: "50¢", value: 0.50 }
  ]},
  { groupe: "Euros pièces", values: [
    { label: "1€", value: 1.00 },
    { label: "2€", value: 2.00 }
  ]},
  { groupe: "Euros billets", values: [
    { label: "5€", value: 5.00 },
    { label: "10€", value: 10.00 },
    { label: "20€", value: 20.00 },
    { label: "50€", value: 50.00 }
  ]}
];

function applyCategorieEmoji(bocal, categorie) {
  // chercher un emoji existant (comme élément séparé, pas enfant du bocal)
  let emojiEl = document.querySelector('[data-emoji-for="' + bocal._id + '"]');
  
  if (!emojiEl) {
    emojiEl = document.createElement("div");
    emojiEl.className = "categorie-emoji";
    emojiEl.setAttribute("data-emoji-for", bocal._id);
    Object.assign(emojiEl.style, {
      position: "absolute",
      pointerEvents: "none",
      userSelect: "none",
      lineHeight: "1",
      textAlign: "right",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "flex-end"
    });
    land.appendChild(emojiEl);
    
    // Stocker la référence dans le bocal
    if (!bocal._relatedElements) bocal._relatedElements = [bocal];
    bocal._relatedElements.push(emojiEl);
  }
  
  // Calculer le quart en incluant les bordures
  const bocalSize = parseFloat(bocal.style.width) || bocal.offsetWidth;
  const bocalLeft = parseFloat(bocal.style.left) || 0;
  const bocalTop = parseFloat(bocal.style.top) || 0;
  const bocalZIndex = parseInt(bocal.style.zIndex) || 10;
  
  const borderSize = 4; // bordure de 4px
  const totalSize = bocalSize + (borderSize * 2); // taille totale avec bordures
  const quartSize = totalSize * 0.25;
  
  // Positionner pour que le coin bas droit de l'émoji = coin bas droit du conteneur (avec bordure)
  const emojiLeft = (bocalLeft + bocalSize + borderSize - quartSize);
  const emojiTop = (bocalTop + bocalSize + borderSize - quartSize);
  emojiEl.style.left = emojiLeft + "px";
  emojiEl.style.top = emojiTop + "px";
  emojiEl.style.width = quartSize + "px";
  emojiEl.style.height = quartSize + "px";
  emojiEl.style.zIndex = bocalZIndex + 1; // au-dessus du bocal
  
  // Taille de l'émoji pour remplir le quart
  const emojiSize = quartSize * 0.8; // 80% du quart pour bien le remplir
  
  emojiEl.style.fontSize = emojiSize + "px";
  emojiEl.textContent = categorieEmojis[categorie] || categorieEmojis["Courant"];
}

function escapeHtml(s){ return (""+s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function findRelatedDiv(bocal, role) {
  if (!bocal || !bocal._relatedElements) return null;
  for (let i = 1; i < bocal._relatedElements.length; i++) {
    const el = bocal._relatedElements[i];
    if (el.dataset && el.dataset.role === role) return el;
  }
  return null;
}
function fermerFenetre(){ fenetre.style.display = "none"; }

// ---------------------------
// Raccourcis & global handlers
// ---------------------------
// Raccourcis clavier globaux
document.addEventListener("keydown", function(e) {
  const activeTag = document.activeElement.tagName;
  const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag);
  
  // Espace : ouvrir fenêtre création (sauf dans les inputs)
  if (e.code === "Space" && !isInput) {
    e.preventDefault(); 
    afficherFenetre();
  }
  
  // G : ouvrir graphique (sauf dans les inputs)
  else if (e.key.toLowerCase() === "g" && !isInput) {
    e.preventDefault();
    // Ouvrir seulement si pas déjà ouvert
    if (graphiqueFenetre.style.display !== "flex") {
      graphiqueBtn.click();
    }
  }
  
  // Échap : fermer fenêtres ouvertes
  else if (e.code === "Escape") {
    // Priorité 1 : fermer fenêtre graphique si ouverte
    if (graphiqueFenetre.style.display === "flex") {
      e.preventDefault();
      graphiqueCloseBtn.click();
    }
    // Priorité 2 : fermer fenêtre création si ouverte
    else if (fenetre.style.display === "block") {
      e.preventDefault();
      fermerFenetre();
    }
    // Priorité 3 : fermer menu contextuel si ouvert
    else if (menuContextuel.style.display === "block") {
      e.preventDefault();
      menuContextuel.style.display = "none";
      menuContextuel._targetBocal = null;
    }
  }
});

// Global Enter: map to visible valider buttons in fenetre
fenetre.addEventListener("keydown", function(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const b1 = fenetre.querySelector("#validerBtn");
  const b2 = fenetre.querySelector("#validerVersement");
  const b3 = fenetre.querySelector("#validerRenommer");
  const b4 = fenetre.querySelector("#validerParam");
  let cible = null;
  if (b1 && b1.offsetParent !== null) cible = b1;
  else if (b2 && b2.offsetParent !== null) cible = b2;
  else if (b3 && b3.offsetParent !== null) cible = b3;
  else if (b4 && b4.offsetParent !== null) cible = b4;
  else {
    const buttons = Array.from(fenetre.querySelectorAll("button"));
    cible = buttons.find(function(b) { return /valider/i.test(b.textContent) && b.offsetParent !== null; }) || null;
  }
  if (cible) cible.click();
});

// ---------------------------
// Bocaux storage & lifecycle
// ---------------------------
let currentZIndex = 10;
let bocaux = [];

function saveBocaux(){
  localStorage.setItem("bocaux", JSON.stringify(bocaux));
  updateTotalPatrimoine();
  updateTotalPatrimoineVise();
  updateTotalPatrimoineSimule();
  updateObjectifsDynamiques();
  updateSimulationsDynamiques();
  synchroniserCloud();
}

// Mettre à jour tous les objectifs dynamiques
function updateObjectifsDynamiques() {
  bocaux.forEach(function(b) {
    if (b.objectifDynamique && b.objectifDynamiqueConfig && b.objectifDynamiqueConfig.length > 0) {
      let total = 0;
      b.objectifDynamiqueConfig.forEach(function(config) {
        const bocalRef = bocaux.find(function(x) { return x.id === config.bocalId; });
        if (bocalRef) {
          let capital = 0;
          
          if (bocalRef.categorie === "Goutte") {
            // Pour Goutte, calculer depuis la composition
            if (bocalRef.composition) {
              Object.keys(bocalRef.composition).forEach(function(label) {
                const qty = bocalRef.composition[label] || 0;
                const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
                if (valInfo) {
                  capital += qty * valInfo.value;
                }
              });
            }
          } else if (bocalRef.categorie === "Fuite") {
            capital = bocalRef.investment || 0;
          } else {
            capital = (bocalRef.investment || 0) + (bocalRef.interest || 0);
          }
          
          total += capital * (config.pourcentage / 100);
        }
      });
      b.objectif = formatNumber(total);
      
      // Mettre à jour l'affichage
      const bocalElem = bocalMap.get(b.id);
      if (bocalElem) {
        const objDiv = findRelatedDiv(bocalElem, "objectif");
        if (objDiv) objDiv.textContent = formatMoney(b.objectif);
      }
    }
  });
  updateTotalPatrimoineVise();
}

// Mettre à jour toutes les simulations dynamiques
function updateSimulationsDynamiques() {
  bocaux.forEach(function(b) {
    if (b.simulationDynamique && b.simulationDynamiqueConfig && b.simulationDynamiqueConfig.length > 0) {
      let total = 0;
      b.simulationDynamiqueConfig.forEach(function(config) {
        const bocalRef = bocaux.find(function(x) { return x.id === config.bocalId; });
        if (bocalRef) {
          let capital = 0;
          
          // MODIFICATION IMPORTANTE: Pour les simulations dynamiques, utiliser la simulation
          capital = bocalRef.simulation || 0;
          
          total += capital * (config.pourcentage / 100);
        }
      });
      b.simulation = formatNumber(total);
      
      // Mettre à jour l'affichage
      const bocalElem = bocalMap.get(b.id);
      if (bocalElem) {
        const simDiv = findRelatedDiv(bocalElem, "simulation");
        if (simDiv) simDiv.textContent = formatMoney(b.simulation);
      }
    }
  });
  updateTotalPatrimoineSimule();
}

function loadBocaux(){
  const data = localStorage.getItem("bocaux");
  if (!data) return;
  try {
    const saved = JSON.parse(data);
    bocaux = saved.map(function(b) {
      return {
        id: b.id,
        nom: b.nom,
        volume: formatNumber(b.volume) || 0,
        capital: formatNumber(b.capital) || 0,
        objectif: formatNumber(b.objectif) || 0,
        simulation: formatNumber(b.simulation) || 0,
        investment: formatNumber(b.investment) || 0,
        interest: formatNumber(b.interest) || 0,
        left: Number(b.left) || 100,
        top: Number(b.top) || 100,
        zIndex: b.zIndex || null,
        anchored: !!b.anchored,
        categorie: b.categorie || "Courant",
        composition: b.composition || {},
        montantFuite: formatNumber(b.montantFuite) || 0,
        periodeFuite: b.periodeFuite || "Mensuel",
        objectifDynamique: b.objectifDynamique || false,
        objectifDynamiqueConfig: b.objectifDynamiqueConfig || [],
        simulationDynamique: b.simulationDynamique || false,
        simulationDynamiqueConfig: b.simulationDynamiqueConfig || []
      };
    });
    bocaux.forEach(function(b) {
      const el = creerBocal(
        b.nom, b.volume, b.capital, b.objectif, b.simulation,
        b.left, b.top, b.zIndex, b.anchored,
        b.id, b.investment, b.interest, true, b.categorie,
        b.composition, b.xRatio, b.yRatio
      );
      el._investment = b.investment;
      el._interest   = b.interest;
      applyCategorieEmoji(el, b.categorie || "Courant");
      updateBocalDisplay(el, /*save=*/false);
      if (b.zIndex > currentZIndex) currentZIndex = b.zIndex;
    });
    updateTotalPatrimoine();
    updateTotalPatrimoineVise();
    updateTotalPatrimoineSimule();
  } catch (e) {
    console.error("Erreur parsing localStorage bocaux:", e);
  }
}

// ---------------------------
// Fonction pour obtenir les limites du land
// ---------------------------
function getLandBounds() {
  const landRect = land.getBoundingClientRect();
  return {
    left: 0,
    top: 0,
    right: landRect.width,
    bottom: landRect.height,
    width: landRect.width,
    height: landRect.height
  };
}

// ---------------------------
// update display: sizes, fills, popup, texts
//    -> IMPORTANT : ici on snap le CENTRE du bocal sur le cadrillage
// ---------------------------
function updateBocalDisplay(bocal, save = true) {
  if (!bocal) return;
  const idx = bocaux.findIndex(function(b) { return b.id === bocal._id; });
  const investment = formatNumber(bocal._investment || 0);
  const interest   = formatNumber(bocal._interest || 0);
  
  // Pour Fuite, le capital = uniquement investissement (pas d'intérêts)
  // Pour Goutte, le capital = calculé depuis la composition
  const isFuite = (idx !== -1 && bocaux[idx].categorie === "Fuite");
  const isGoutte = (idx !== -1 && bocaux[idx].categorie === "Goutte");
  
  let capital = 0;
  if (isFuite) {
      capital = investment;
  } else if (isGoutte) {
      // IMPORTANT: Calculer depuis la composition
      const composition = (idx !== -1 && bocaux[idx].composition) ? bocaux[idx].composition : {};
      Object.keys(composition).forEach(function(label) {
          const qty = composition[label] || 0;
          const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
          if (valInfo) {
          capital += qty * valInfo.value;
          }
      });
  } else {
      capital = investment + interest;
  }

  if (idx !== -1) {
    bocaux[idx].investment = investment;
    bocaux[idx].interest = interest;
    bocaux[idx].capital = formatNumber(capital);
  }

  // Récupérer les limites du land
  const landBounds = getLandBounds();
  
  // Récupère la taille actuelle (avant changement) pour calculer le centre
  const oldWidth = parseFloat(bocal.style.width) || bocal.offsetWidth || 0;
  const oldHeight = parseFloat(bocal.style.height) || bocal.offsetHeight || oldWidth;

  const left = parseFloat(bocal.style.left) || 100;
  const top  = parseFloat(bocal.style.top)  || 100;

  // centre actuel
  const centerX = left + oldWidth / 2;
  const centerY = top + oldHeight / 2;

  // nouvelle taille : sqrt(max(capital,0) + 1000)
  const safeCapital = Math.max(capital, 0);
  const newSize = Math.sqrt(safeCapital + 1000);

  // snap du centre au quadrillage
  const snappedCenterX = Math.round(centerX / gridSpacing) * gridSpacing;
  const snappedCenterY = Math.round(centerY / gridSpacing) * gridSpacing;

  // calcule la nouvelle left/top pour garder le centre snapé
  let newLeft = snappedCenterX - newSize / 2;
  let newTop  = snappedCenterY - newSize / 2;

  // Vérifier les limites du land
  // Empêcher de sortir à gauche
  if (newLeft < 0) newLeft = 0;
  // Empêcher de sortir en haut
  if (newTop < 0) newTop = 0;
  // Empêcher de sortir à droite
  if (newLeft + newSize > landBounds.width) newLeft = landBounds.width - newSize;
  // Empêcher de sortir en bas
  if (newTop + newSize > landBounds.height) newTop = landBounds.height - newSize;

  // applique la nouvelle taille et position (centrée sur la grille)
  bocal.style.width = newSize + "px";
  bocal.style.height = newSize + "px";
  bocal.style.left = newLeft + "px";
  bocal.style.top  = newTop + "px";

  // reposition texts
  const related = bocal._relatedElements || [];
  const lineHeight = 18;
  const divs = related.slice(1).filter(function(el) { return el.dataset && el.dataset.role; });
  divs.forEach(function(d, i) {
    d.style.left = (newLeft + newSize/2) + "px";
    d.style.top  = (newTop + newSize + 5 + i*lineHeight) + "px";
    if (d.dataset && d.dataset.role === "capital") {
      d.textContent = formatMoney(capital);
    }
    // Mettre à jour montant-période pour Fuite
    if (d.dataset && d.dataset.role === "montant-periode") {
      const idxBocal = bocaux.findIndex(function(b) { return b.id === bocal._id; });
      if (idxBocal !== -1) {
        const montant = bocaux[idxBocal].montantFuite || 0;
        const periode = bocaux[idxBocal].periodeFuite || "Mensuel";
        d.textContent = formatMoney(montant) + " | " + periode;
      }
    }
  });

  // determine objectif et simulation
  let objectif = 0;
  let simulation = 0;
  const idxObj = bocaux.findIndex(function(b) { return b.id === bocal._id; });
  if (idxObj !== -1) {
    objectif = formatNumber(bocaux[idxObj].objectif) || 0;
    simulation = formatNumber(bocaux[idxObj].simulation) || 0;
  }
  
  if (objectif === 0) {
    const objDiv = findRelatedDiv(bocal, "objectif");
    if (objDiv) {
      const parsed = formatNumber((objDiv.textContent || "").replace(/\s?€/, ""));
      if (!isNaN(parsed)) objectif = parsed;
    }
  }
  
  if (simulation === 0) {
    const simDiv = findRelatedDiv(bocal, "simulation");
    if (simDiv) {
      const parsed = formatNumber((simDiv.textContent || "").replace(/\s?€/, ""));
      if (!isNaN(parsed)) simulation = parsed;
    }
  }

  // compute proportions
  let invPercent = 0;
  let intrPercent = 0;

  // Utiliser l'objectif ou la simulation pour le calcul des pourcentages
  const referenceValue = objectif > 0 ? objectif : (simulation > 0 ? simulation : capital);
  
  if (referenceValue > 0) {
    if (capital <= referenceValue) {
      invPercent = investment / referenceValue;
      intrPercent = interest / referenceValue;
    } else {
      const totalForNorm = Math.abs(investment) + Math.abs(interest);
      if (totalForNorm > 0) {
        const normInv = investment / totalForNorm;
        const normIntr = interest / totalForNorm;
        // scale to 95%
        invPercent = normInv * 0.95;
        intrPercent = normIntr * 0.95;
      } else {
        invPercent = 0; intrPercent = 0;
      }
    }
  } else {
    const positiveInvestment = Math.max(investment, 0);
    const positiveInterest = Math.max(interest, 0);
    if (capital > 0) {
      invPercent = positiveInvestment / capital;
      intrPercent = positiveInterest / capital;
    } else {
      if (positiveInvestment > 0 && positiveInterest <= 0) { invPercent = 1; intrPercent = 0; }
      else if (positiveInterest > 0 && positiveInvestment <= 0) { invPercent = 0; intrPercent = 1; }
      else { invPercent = 0; intrPercent = 0; }
    }
  }

  invPercent = Math.max(0, Math.min(1, invPercent));
  intrPercent = Math.max(0, Math.min(1, intrPercent));

  // popup update & reposition
  if (bocal._popup) {
    const idx = bocaux.findIndex(function(b) { return b.id === bocal._id; });
    const cat = (idx !== -1 && bocaux[idx].categorie) ? bocaux[idx].categorie : "Courant";
    
    // Pour Fuite, uniquement investissement
    if (cat === "Fuite") {
      const inv = bocal._popup.querySelector(".pv-inv");
      if (inv) inv.textContent = "Investissement: " + formatMoney(investment);
      // Supprimer la ligne intérêts si elle existe
      const intr = bocal._popup.querySelector(".pv-intr");
      if (intr) intr.remove();
    } else if (cat === "Goutte") {
      // Pour Goutte, calculer depuis la composition
      let totalBillets = 0;
      let totalPieces = 0;
      
      if (idx !== -1 && bocaux[idx].composition) {
        Object.keys(bocaux[idx].composition).forEach(function(label) {
          const qty = bocaux[idx].composition[label] || 0;
          const valInfo = monnaieValues.flatMap(function(g) { return g.values; }).find(function(v) { return v.label === label; });
          if (valInfo) {
            const montant = qty * valInfo.value;
            if (label === "5€" || label === "10€" || label === "20€" || label === "50€") {
              totalBillets += montant;
            } else {
              totalPieces += montant;
            }
          }
        });
      }
      
      const inv = bocal._popup.querySelector(".pv-inv");
      const intr = bocal._popup.querySelector(".pv-intr");
      if (inv) inv.textContent = "Billets: " + formatMoney(totalBillets);
      if (intr) intr.textContent = "Pièces: " + formatMoney(totalPieces);
    } else {
      const inv = bocal._popup.querySelector(".pv-inv");
      const intr = bocal._popup.querySelector(".pv-intr");
      if (inv) inv.textContent = "Investissement: " + formatMoney(investment);
      if (intr) intr.textContent = "Intérêts: " + formatMoney(interest);
    }
    
    const rect = bocal.getBoundingClientRect();
    bocal._popup.style.top  = (rect.top + window.pageYOffset - 50) + "px";
    bocal._popup.style.left = (rect.right + window.pageXOffset + 10) + "px";
  }
  
  // mettre à jour la taille de l'emoji si présent
  const emojiEl = document.querySelector('[data-emoji-for="' + bocal._id + '"]');
  if (emojiEl) {
    const borderSize = 4;
    const totalSize = newSize + (borderSize * 2);
    const quartSize = totalSize * 0.25;
    
    // Repositionner l'emoji - coin bas droit aligné avec coin bas droit du conteneur
    emojiEl.style.left = (newLeft + newSize + borderSize - quartSize) + "px";
    emojiEl.style.top = (newTop + newSize + borderSize - quartSize) + "px";
    emojiEl.style.width = quartSize + "px";
    emojiEl.style.height = quartSize + "px";
    emojiEl.style.zIndex = parseInt(bocal.style.zIndex) + 1;
    
    const emojiSize = quartSize * 0.8;
    emojiEl.style.fontSize = emojiSize + "px";
  }

  // ensure fills exist (pas pour Fuite)
  const isFuiteForFills = (idx !== -1 && bocaux[idx].categorie === "Fuite");
  
  if (!isFuiteForFills) {
    if (!bocal._investmentFill) {
      const fillInv = document.createElement("div");
      Object.assign(fillInv.style, {
        position: "absolute",
        bottom: "0",
        left: "0",
        width: "100%",
        height: "0%",
        backgroundColor: "#007BFF"
      });
      bocal.appendChild(fillInv);
      bocal._investmentFill = fillInv;
    }
    if (!bocal._interestFill) {
      const fillIntr = document.createElement("div");
      Object.assign(fillIntr.style, {
        position: "absolute",
        left: "0",
        width: "100%",
        height: "0%",
        backgroundColor: "#D79A10"
      });
      bocal.appendChild(fillIntr);
      bocal._interestFill = fillIntr;
    }

    // apply heights (investment bottom, interest above)
    const invH = (invPercent*100);
    const intrH = (intrPercent*100);

    bocal._investmentFill.style.height = invH.toFixed(2) + "%";
    bocal._interestFill.style.bottom = invH.toFixed(2) + "%";
    bocal._interestFill.style.height = intrH.toFixed(2) + "%";
  } else {
    // Pour Fuite, créer uniquement le fill d'investissement (bleu)
    if (!bocal._investmentFill) {
      const fillInv = document.createElement("div");
      Object.assign(fillInv.style, {
        position: "absolute",
        bottom: "0",
        left: "0",
        width: "100%",
        height: "0%",
        backgroundColor: "#007BFF"
      });
      bocal.appendChild(fillInv);
      bocal._investmentFill = fillInv;
    }
    
    // Supprimer le fill d'intérêts s'il existe
    if (bocal._interestFill) {
      bocal._interestFill.remove();
      bocal._interestFill = null;
    }
    
    // Seulement le fill d'investissement
    const invH = (invPercent*100);
    bocal._investmentFill.style.height = invH.toFixed(2) + "%";
  }

  if (save) saveBocaux();
  else {
    updateTotalPatrimoine();
    updateTotalPatrimoineVise();
    updateTotalPatrimoineSimule();
  }
}

// ---------------------------
// create bocal function (with drag+snap using grid overlay)
// accepts optional id, investment/interest, fromLoad flag, categorie
// ---------------------------
function creerBocal(nom, volume, capital, objectif, simulation, left, top, zIndex, anchored, id, investment, interest, fromLoad, categorie, composition, xRatio, yRatio) {
  // --- INITIALISATION ---
  capital = formatNumber(capital) || 0;
  objectif = formatNumber(objectif) || 0;
  simulation = formatNumber(simulation) || 0;
  investment = formatNumber(investment) || 0;
  interest = formatNumber(interest) || 0;
  categorie = categorie || "Courant";
  
  const initCapital = formatNumber(capital) || 0;
  const taille = Math.sqrt(Math.max(initCapital, 0) + 1000);
  currentZIndex++;
  zIndex = zIndex !== null ? Math.max(currentZIndex, zIndex) : currentZIndex;
  currentZIndex = zIndex;

  const bocalWidth = taille, lineHeight = 18;
  const bocal = document.createElement("div");
  bocal.className = "bocal";

  // --- POSITION DYNAMIQUE ---
  const landRect = land.getBoundingClientRect();
  let finalLeft = left || 100;
  let finalTop = top || 100;

  if (xRatio !== undefined && xRatio !== null && yRatio !== undefined && yRatio !== null) {
    finalLeft = xRatio * landRect.width;
    finalTop = yRatio * landRect.height;
    
    // Vérifier que le bocal reste dans les limites
    const maxLeft = landRect.width - bocalWidth;
    const maxTop = landRect.height - bocalWidth;
    
    if (finalLeft > maxLeft) finalLeft = maxLeft;
    if (finalTop > maxTop) finalTop = maxTop;
    if (finalLeft < 0) finalLeft = 0;
    if (finalTop < 0) finalTop = 0;
  }
  
  Object.assign(bocal.style, {
    width: bocalWidth + "px", height: bocalWidth + "px", borderLeft: "4px solid black",
    borderRight: "4px solid black", borderBottom: "4px solid black", borderTop: "none",
    position: "absolute", top: finalTop + "px", left: finalLeft + "px",
    borderRadius: "6px", cursor: "grab", backgroundColor: "rgba(255,255,255,0.9)",
    boxShadow: anchored ? "none" : "3px 3px 10px rgba(0,0,0,0.4)", zIndex: zIndex, overflow: "hidden"
  });
  land.appendChild(bocal);

  bocal._anchored = anchored; bocal._id = id || (Date.now().toString() + Math.random().toFixed(3).slice(2));
  bocal._investment = investment; bocal._interest = interest;

  // --- FILLS ET LABELS ---
  const fillInv = document.createElement("div");
  Object.assign(fillInv.style, { position: "absolute", bottom: "0", left: "0", width: "100%", height: "0%", backgroundColor: "#007BFF" });
  bocal.appendChild(fillInv);
  bocal._investmentFill = fillInv;

  if (categorie !== "Fuite") {
    const fillIntr = document.createElement("div");
    Object.assign(fillIntr.style, { position: "absolute", left: "0", width: "100%", height: "0%", backgroundColor: "#D79A10" });
    bocal.appendChild(fillIntr);
    bocal._interestFill = fillIntr;
  }

  const lines = [
    { text: nom, color: "#000", role: "nom" },
    { text: volume > 0 ? formatMoney(volume) : null, color: "#999", role: "plafond" },
    { text: formatMoney(capital), color: "#2ecc71", role: "capital" },
    { text: formatMoney(objectif), color: "#e74c3c", role: "objectif" },
    { text: formatMoney(simulation), color: "#FF8C00", role: "simulation" }
  ];

  const lines_filtered = lines.filter(ln => ln.text !== null);
  const divs = lines_filtered.map((ln, i) => {
    const d = document.createElement("div");
    d.textContent = ln.text;
    Object.assign(d.style, {
      position: "absolute", top: (finalTop + bocalWidth + 5 + i * lineHeight) + "px",
      left: (finalLeft + bocalWidth / 2) + "px", transform: "translateX(-50%)",
      color: ln.color, fontSize: "14px", whiteSpace: "nowrap", zIndex: zIndex
    });
    land.appendChild(d);
    return d;
  });

  divs.forEach((d, i) => { d.dataset.role = lines_filtered[i].role; });
  bocal._relatedElements = [bocal, ...divs];
  
  // --- GESTION DES CLICS (TOUTES FONCTIONS) ---
  let clickCount = 0;
  bocal.addEventListener("click", (e) => {
    e.stopPropagation();
    clickCount++;
    setTimeout(() => {
      if (clickCount === 1) { // SIMPLE CLIC : MENU
        const r = bocal.getBoundingClientRect(), lr = land.getBoundingClientRect();
        menuContextuel.style.top = (r.top - lr.top) + "px";
        menuContextuel.style.left = (r.right - lr.left + 10) + "px";
        menuContextuel.style.display = "block";
        menuContextuel._targetBocal = bocal;
        btnAncrer.textContent = bocal._anchored ? "Désancrer" : "Ancrer";
        mettreAJourInfoMenuMobile(bocal);
      } else if (clickCount === 2) { // DOUBLE CLIC : FUITE
        const idx = bocaux.findIndex(b => b.id === bocal._id);
        if (idx !== -1 && bocaux[idx].categorie === "Fuite") {
          bocaux[idx].capital = Math.max(0, bocaux[idx].capital - (bocaux[idx].montantFuite || 0));
          bocaux[idx].investment = bocaux[idx].capital;
          updateBocalDisplay(bocal);
          saveBocaux();
        }
      } else if (clickCount >= 5) { // 5 CLICS : SUPPRIMER
        supprimerBocal(bocal);
      }
      clickCount = 0;
    }, 250);
  });

  // --- DRAG AVEC RATIOS ---
  let isDragging = false, ox = 0, oy = 0;
  bocal.addEventListener("mousedown", (e) => {
    if (bocal._anchored) return;
    isDragging = true;
    ox = e.clientX - bocal.offsetLeft; oy = e.clientY - bocal.offsetTop;
    gridOverlay.style.display = "block";

    const onMouseMove = (ev) => {
      if (!isDragging) return;
      const lb = land.getBoundingClientRect();
      let nl = Math.max(0, Math.min(ev.clientX - ox, lb.width - bocalWidth));
      let nt = Math.max(0, Math.min(ev.clientY - oy, lb.height - bocalWidth));
      // Snap
      nl = Math.round((nl + bocalWidth/2) / 20) * 20 - bocalWidth/2;
      nt = Math.round((nt + bocalWidth/2) / 20) * 20 - bocalWidth/2;
      bocal.style.left = nl + "px"; bocal.style.top = nt + "px";
      divs.forEach((d, i) => {
        d.style.left = (nl + bocalWidth/2) + "px";
        d.style.top = (nt + bocalWidth + 5 + i * lineHeight) + "px";
      });
    };

    const onMouseUp = () => {
      isDragging = false; 
      gridOverlay.style.display = "none";
      
      const lb = land.getBoundingClientRect();
      const idx = bocaux.findIndex(b => b.id === bocal._id);
      
      if (idx !== -1) {
        const currentLeft = parseFloat(bocal.style.left) || 0;
        const currentTop = parseFloat(bocal.style.top) || 0;
        
        bocaux[idx].left = currentLeft;
        bocaux[idx].top = currentTop;
        bocaux[idx].xRatio = currentLeft / lb.width;
        bocaux[idx].yRatio = currentTop / lb.height;
        
        saveBocaux();
      }
      
      document.removeEventListener("mousemove", onMouseMove); 
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  // Support tactile pour mobile
  bocal.addEventListener("touchstart", (e) => {
    if (bocal._anchored) return;
    
    const touch = e.touches[0];
    isDragging = true;
    ox = touch.clientX - bocal.offsetLeft;
    oy = touch.clientY - bocal.offsetTop;
    gridOverlay.style.display = "block";
    
    e.preventDefault();

    const onTouchMove = (ev) => {
      if (!isDragging) return;
      
      const touch = ev.touches[0];
      const lb = land.getBoundingClientRect();
      let nl = Math.max(0, Math.min(touch.clientX - ox, lb.width - bocalWidth));
      let nt = Math.max(0, Math.min(touch.clientY - oy, lb.height - bocalWidth));
      
      nl = Math.round((nl + bocalWidth/2) / 20) * 20 - bocalWidth/2;
      nt = Math.round((nt + bocalWidth/2) / 20) * 20 - bocalWidth/2;
      
      bocal.style.left = nl + "px";
      bocal.style.top = nt + "px";
      
      divs.forEach((d, i) => {
        d.style.left = (nl + bocalWidth/2) + "px";
        d.style.top = (nt + bocalWidth + 5 + i * lineHeight) + "px";
      });
      
      ev.preventDefault();
    };

    const onTouchEnd = () => {
      isDragging = false;
      gridOverlay.style.display = "none";
      
      const lb = land.getBoundingClientRect();
      const idx = bocaux.findIndex(b => b.id === bocal._id);
      
      if (idx !== -1) {
        const currentLeft = parseFloat(bocal.style.left) || 0;
        const currentTop = parseFloat(bocal.style.top) || 0;
        
        bocaux[idx].left = currentLeft;
        bocaux[idx].top = currentTop;
        bocaux[idx].xRatio = currentLeft / lb.width;
        bocaux[idx].yRatio = currentTop / lb.height;
        
        saveBocaux();
      }
      
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
    
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
  });
  
  if (!fromLoad) {
    const lb = land.getBoundingClientRect();
    bocaux.push({
      id: bocal._id, nom, volume, capital, objectif, simulation, investment, interest,
      xRatio: finalLeft / lb.width, yRatio: finalTop / lb.height,
      zIndex, anchored: !!anchored, categorie, composition: composition || {}
    });
    saveBocaux();
  }
  bocalMap.set(bocal._id, bocal);
  updateBocalDisplay(bocal);
  return bocal;
}

// ---------------------------
// supprimerBocal
// ---------------------------
function supprimerBocal(bocal){
  if(!bocal) return;
  if (bocal._popup) { bocal._popup.remove(); bocal._popup = null; }
  (bocal._relatedElements || []).forEach(function(el){ el.remove(); });
  bocalMap.delete(bocal._id);
  const idx = bocaux.findIndex(function(b){ return b.id === bocal._id; });
  if(idx !== -1) bocaux.splice(idx,1);
  saveBocaux();
}

if (btnSupprimer) btnSupprimer.addEventListener("click", function(){
  const c = menuContextuel._targetBocal;
  supprimerBocal(c);
  menuContextuel.style.display = "none"; menuContextuel._targetBocal = null;
});

if (btnAncrer) btnAncrer.addEventListener("click", function(){
  const b = menuContextuel._targetBocal; if(!b) return;
  const idx = bocaux.findIndex(function(x){ return x.id === b._id; });
  if(btnAncrer.textContent === "Ancrer"){
    btnAncrer.textContent = "Désancrer"; b.style.boxShadow = "none"; b._anchored = true;
    if(idx !== -1) bocaux[idx].anchored = true;
  } else {
    btnAncrer.textContent = "Ancrer"; b.style.boxShadow = "3px 3px 10px rgba(0,0,0,0.4)"; b._anchored = false;
    if(idx !== -1) bocaux[idx].anchored = false;
  }
  saveBocaux(); menuContextuel.style.display = "none";
});

if (btnRenommer) btnRenommer.addEventListener("click", function(){
  const cible = menuContextuel._targetBocal;
  if (!cible) return;
  afficherRenommer(cible);
});

if (btnVersement) btnVersement.addEventListener("click", function(){
  const cible = menuContextuel._targetBocal;
  if (!cible) return;
  afficherVersement();
});

if (btnParametre) btnParametre.addEventListener("click", function(){
  const cible = menuContextuel._targetBocal;
  if (!cible) return;
  afficherParametre(cible);
});

// hide menu on outside click
document.addEventListener("click", function(){
  menuContextuel.style.display = "none";
  menuContextuel._targetBocal = null;
});

// load saved bocaux and mission on start
window.addEventListener("load", function() {
  loadBocaux();
  initMission(); 
  loadMission();
});

// ==========================================
// GESTION DU RESIZE ET ORIENTATION MOBILE
// ==========================================

let resizeTimeout = null;

function repositionnerTousBocaux() {
  const landBounds = getLandBounds();
  
  bocaux.forEach(data => {
    const bocal = bocalMap.get(data.id);
    if (!bocal || data.xRatio === undefined) return;
    
    // Calculer la nouvelle position basée sur les ratios
    const bocalWidth = parseFloat(bocal.style.width) || bocal.offsetWidth;
    let newLeft = data.xRatio * landBounds.width;
    let newTop = data.yRatio * landBounds.height;
    
    // Vérifier les limites pour ne pas sortir du land
    if (newLeft < 0) newLeft = 0;
    if (newTop < 0) newTop = 0;
    if (newLeft + bocalWidth > landBounds.width) {
      newLeft = landBounds.width - bocalWidth;
    }
    if (newTop + bocalWidth > landBounds.height) {
      newTop = landBounds.height - bocalWidth;
    }
    
    // Appliquer la position
    bocal.style.left = newLeft + "px";
    bocal.style.top = newTop + "px";
    
    // Repositionner les labels
    const related = bocal._relatedElements || [];
    const lineHeight = 18;
    const divs = related.slice(1).filter(el => el.dataset && el.dataset.role);
    
    divs.forEach((d, i) => {
      d.style.left = (newLeft + bocalWidth/2) + "px";
      d.style.top = (newTop + bocalWidth + 5 + i * lineHeight) + "px";
    });
    
    // Repositionner l'emoji
    const emojiEl = document.querySelector('[data-emoji-for="' + bocal._id + '"]');
    if (emojiEl) {
      const borderSize = 4;
      const totalSize = bocalWidth + (borderSize * 2);
      const quartSize = totalSize * 0.25;
      
      emojiEl.style.left = (newLeft + bocalWidth + borderSize - quartSize) + "px";
      emojiEl.style.top = (newTop + bocalWidth + borderSize - quartSize) + "px";
      emojiEl.style.width = quartSize + "px";
      emojiEl.style.height = quartSize + "px";
      
      const emojiSize = quartSize * 0.8;
      emojiEl.style.fontSize = emojiSize + "px";
    }
    
    // Repositionner le popup s'il est visible
    if (bocal._popup && bocal._popup.style.display === "block") {
      const rect = bocal.getBoundingClientRect();
      bocal._popup.style.top = (rect.top + window.pageYOffset - 50) + "px";
      bocal._popup.style.left = (rect.right + window.pageXOffset + 10) + "px";
    }
  });
  
  // Ajuster le menu contextuel s'il est ouvert
  if (menuContextuel._targetBocal && menuContextuel.style.display === "block") {
    ajusterPositionMenu(menuContextuel._targetBocal);
  }
}

// Listener resize avec debounce
window.addEventListener('resize', () => {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }
  
  resizeTimeout = setTimeout(() => {
    repositionnerTousBocaux();
    
    if (graphiqueFenetre.style.display === "flex") {
      dessinerGraphique();
    }
  }, 150);
});

// Listener pour changement d'orientation mobile
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    repositionnerTousBocaux();
    
    if (graphiqueFenetre.style.display === "flex") {
      dessinerGraphique();
    }
  }, 300);
});

// Repositionner au chargement
window.addEventListener('load', () => {
  setTimeout(repositionnerTousBocaux, 100);
});










