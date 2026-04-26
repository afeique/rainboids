// Shop rendering methods extracted from GameEngine.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { drawCachedMoneyIcon } from '../core/utils.js';

export function drawShop() {
        // Initialize scroll offset if not set
        if (this.shopScrollOffset === undefined) {
            this.shopScrollOffset = 0;
        }
        // Reset hit-test arrays each frame
        this.shopItemBounds = [];
        this.shopSellButtonBounds = [];

        // Fullscreen layout matching the pause menu — shop fills the entire
        // viewport with the same 78% backdrop, edge margins for breathing room,
        // and the goldenrod-styled scrollbar on the right edge.
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // shopWindowBounds is the CONTENT region (used for hit-testing tabs,
        // items, scrollbar). Now spans the full viewport with side padding.
        const sidePad = 40;
        const shopWindowWidth = this.width - sidePad * 2;
        const shopWindowHeight = this.height - 100; // leave room for footer instructions
        const shopWindowX = sidePad;
        const shopWindowY = 60;

        this.shopWindowBounds = {
            x: shopWindowX,
            y: shopWindowY,
            width: shopWindowWidth,
            height: shopWindowHeight
        };

        // Close (X) button — square, margin from border, opacity + glow on hover
        const closeBtnSize = 28;
        const closeBtnMargin = 12;
        const closeBtnX = shopWindowX + closeBtnMargin;
        const closeBtnY = shopWindowY + closeBtnMargin;
        const closeBtnCorner = 5;
        this.shopCloseBounds = { x: closeBtnX, y: closeBtnY, width: closeBtnSize, height: closeBtnSize };

        const closeHovered = this.mouseX !== undefined &&
            this.mouseX >= closeBtnX && this.mouseX <= closeBtnX + closeBtnSize &&
            this.mouseY >= closeBtnY && this.mouseY <= closeBtnY + closeBtnSize;

        this.ctx.save();
        this.ctx.globalAlpha = closeHovered ? 1.0 : 0.5;

        // Fill
        this.ctx.fillStyle = closeHovered ? 'rgba(220, 50, 50, 1.0)' : 'rgba(150, 25, 25, 1.0)';
        this.ctx.beginPath();
        this.ctx.roundRect(closeBtnX, closeBtnY, closeBtnSize, closeBtnSize, closeBtnCorner);
        this.ctx.fill();

        // Stroke with glow on hover
        if (closeHovered) {
            this.ctx.shadowColor = 'rgba(255, 80, 80, 0.9)';
            this.ctx.shadowBlur = 14;
        }
        this.ctx.strokeStyle = closeHovered ? '#ff9999' : '#993333';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.roundRect(closeBtnX, closeBtnY, closeBtnSize, closeBtnSize, closeBtnCorner);
        this.ctx.stroke();

        // X lines (no shadow)
        this.ctx.shadowBlur = 0;
        const closeCx = closeBtnX + closeBtnSize / 2;
        const closeCy = closeBtnY + closeBtnSize / 2;
        const xOff = 6;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(closeCx - xOff, closeCy - xOff);
        this.ctx.lineTo(closeCx + xOff, closeCy + xOff);
        this.ctx.moveTo(closeCx + xOff, closeCy - xOff);
        this.ctx.lineTo(closeCx - xOff, closeCy + xOff);
        this.ctx.stroke();
        this.ctx.restore();

        // Shop title - larger and more prominent
        this.ctx.fillStyle = '#00ccff';
        this.ctx.font = 'bold 32px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SHOP', this.width / 2, 60);

        // Currency display — single line, centered: [💰 amount]   [amount SP]
        const centerX      = shopWindowX + shopWindowWidth / 2;
        const currencyRowY = shopWindowY + 52;
        const iconSize     = 18;
        const labelGap     = 8;   // gap between coin icon and coin amount
        const sectionGap   = 28;  // gap between coin section and SP section
        const spLabelGap   = 4;   // tight gap between SP number and "SP" label

        this.ctx.font = 'bold 14px "Press Start 2P", monospace';
        this.ctx.textBaseline = 'middle';

        const coinStr  = `${Math.floor(this.game.money)}`;
        const spNum    = `${this.player.skillPoints}`;
        const spLabel  = 'SP';

        const coinTextW  = this.ctx.measureText(coinStr).width;
        const spNumW     = this.ctx.measureText(spNum).width;
        const spLabelW   = this.ctx.measureText(spLabel).width;

        // Total line width: [icon + gap + coinAmount] [sectionGap] [spAmount + labelGap + SP]
        const coinSectionW = iconSize + labelGap + coinTextW;
        const spSectionW   = spNumW + spLabelGap + spLabelW;
        const totalLineW   = coinSectionW + sectionGap + spSectionW;
        const lineLeft     = centerX - totalLineW / 2;

        // Coin icon + amount
        drawCachedMoneyIcon(this.ctx, lineLeft + iconSize / 2, currencyRowY, iconSize, '#FFD700', '#B8860B');
        this.ctx.fillStyle = '#FFD700';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(coinStr, lineLeft + iconSize + labelGap, currencyRowY);

        // SP amount + label (tight gap)
        const spStartX = lineLeft + coinSectionW + sectionGap;
        this.ctx.fillStyle = '#6AB7FF';
        this.ctx.fillText(spNum, spStartX, currencyRowY);
        this.ctx.fillStyle = '#4A90E2';
        this.ctx.fillText(spLabel, spStartX + spNumW + spLabelGap, currencyRowY);

        // Draw category tabs below currency display
        const tabsY = currencyRowY + 34; // keeps tabs at same absolute position as before
        this.drawShopTabs(shopWindowX, tabsY, shopWindowWidth);

        // Setup clipping for scrollable area (adjusted for tabs)
        const contentStartY = tabsY + 40; // Start content below tabs
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(shopWindowX + 10, contentStartY, shopWindowWidth - 20, shopWindowHeight - (contentStartY - shopWindowY) - 20);
        this.ctx.clip();

        // Items live in a centered 900px-max column to match the
        // pause-menu's `min(900px, 100%)` content rule. Scrollbar still
        // anchors to the right edge of the viewport content area.
        const SCROLLBAR_RESERVE = 24;
        const maxColumn = 900;
        const columnWidth = Math.min(maxColumn, shopWindowWidth - SCROLLBAR_RESERVE);
        const itemWidth = columnWidth - 20; // small inner padding
        const itemHeight = 100;
        const padding = 12;
        const startX = (this.width - columnWidth) / 2;

        // Filter items by current category
        const filteredItems = this.shopFilteredItems;

        // Calculate total content height for scroll limits
        const totalContentHeight = filteredItems.length * (itemHeight + padding);
        const availableHeight = shopWindowHeight - (contentStartY - shopWindowY) - 20; // Height available for items
        const maxScroll = Math.max(0, totalContentHeight - availableHeight);

        // Clamp scroll offset
        this.shopScrollOffset = Math.max(0, Math.min(maxScroll, this.shopScrollOffset));

        // Calculate start Y position after clamping scroll offset
        const startY = contentStartY + 10 - this.shopScrollOffset;

        // Draw filtered shop items with hover detection
        filteredItems.forEach((item, index) => {
            const x = startX;
            const y = startY + index * (itemHeight + padding);

            // Only draw items that are visible in the scroll area
            if (y + itemHeight >= shopWindowY + 20 && y <= shopWindowY + shopWindowHeight - 60) {
                let isHovered = false;
                if (this.mouseX !== undefined && this.mouseY !== undefined) {
                    isHovered = this.mouseX >= x && this.mouseX <= x + itemWidth &&
                               this.mouseY >= y && this.mouseY <= y + itemHeight &&
                               this.mouseY >= contentStartY && this.mouseY <= shopWindowY + shopWindowHeight;
                }

                this.drawShopItem(item, x, y, itemWidth, itemHeight, index, isHovered);
            }
        });

        this.ctx.restore(); // Remove clipping

        // ─── Goldenrod scrollbar — matches the pause-menu CSS scrollbar ───
        // No arrow buttons (CSS scrollbars don't have them either), thinner
        // 12px profile, anchored to the CONTENT area (was misaligned to the
        // shop window — sat above the tabs and overlapped them). Track and
        // thumb colors match the music player's scrollbar exactly.
        if (maxScroll > 0) {
            const SB_WIDTH = 12;
            const TRACK_BG = '#5a4509';
            const THUMB = (this.shopScrollThumbDrag || this.shopScrollUpHover || this.shopScrollDownHover) ? '#FFD740' : '#FFC107';
            const corner = 6;

            // Anchor scrollbar to the right edge of the centered column
            // (not the viewport) — same visual relationship as the
            // pause-menu's scrollbar relative to its content column.
            const scrollBarX = startX + columnWidth + 6;
            const scrollBarY = contentStartY;
            const scrollBarHeight = availableHeight;
            const scrollThumbHeight = Math.max(24, scrollBarHeight * (scrollBarHeight / totalContentHeight));
            const scrollThumbY = scrollBarY + (this.shopScrollOffset / maxScroll) * (scrollBarHeight - scrollThumbHeight);

            // Bounds for interaction. upArrow / downArrow kept as zero-area
            // rects so the existing click handler can still reference them
            // safely without firing.
            this.shopScrollbarBounds = {
                x: scrollBarX,
                y: scrollBarY,
                width: SB_WIDTH,
                height: scrollBarHeight,
                thumbY: scrollThumbY,
                thumbHeight: scrollThumbHeight,
                trackY: scrollBarY,
                trackHeight: scrollBarHeight,
                upArrow:   { x: 0, y: 0, width: 0, height: 0 },
                downArrow: { x: 0, y: 0, width: 0, height: 0 }
            };

            // Track (rounded, dark goldenrod)
            this.ctx.fillStyle = TRACK_BG;
            this.ctx.beginPath();
            this.ctx.roundRect(scrollBarX, scrollBarY, SB_WIDTH, scrollBarHeight, corner);
            this.ctx.fill();

            // Thumb (rounded, bright goldenrod, with 2px inset border = the
            // CSS thumb's `border: 2px solid var(--track-color)` look).
            this.ctx.fillStyle = THUMB;
            this.ctx.beginPath();
            this.ctx.roundRect(scrollBarX, scrollThumbY, SB_WIDTH, scrollThumbHeight, corner);
            this.ctx.fill();
            this.ctx.strokeStyle = TRACK_BG;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.roundRect(scrollBarX + 1, scrollThumbY + 1, SB_WIDTH - 2, scrollThumbHeight - 2, corner - 1);
            this.ctx.stroke();
        }

        // Purchase flash overlay
        if (this._shopFlash) {
            const elapsed = performance.now() - this._shopFlash.time;
            const duration = 250;
            if (elapsed < duration) {
                const alpha = 1 - elapsed / duration;
                this.ctx.save();
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = this._shopFlash.color;
                this.ctx.fillRect(shopWindowX, shopWindowY, shopWindowWidth, shopWindowHeight);
                this.ctx.restore();
            } else {
                this._shopFlash = null;
            }
        }

        // Instructions - larger and more visible
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '14px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Click items to purchase  •  Press X or ESC to return to the pause menu', this.width / 2, this.height - 30);
    }

export function drawShopTabs(shopX, tabY, shopWidth) {
        const tabs = [
            { key: 'OFFENSE', label: 'OFFENSE', color: [180, 130, 0], stroke: '#FFD700', glow: 'rgba(255, 215, 0, 0.3)' },
            { key: 'DEFENSE', label: 'DEFENSE', color: [50, 100, 200], stroke: '#4A90E2', glow: 'rgba(74, 144, 226, 0.3)' },
            { key: 'DROPS',   label: 'DROPS',   color: [40, 160, 80], stroke: '#44DD88', glow: 'rgba(68, 221, 136, 0.3)' },
            { key: 'PRIMARY', label: 'PRIMARY', color: [0, 160, 200], stroke: '#00CCFF', glow: 'rgba(0, 204, 255, 0.3)' },
            { key: 'POWER',   label: 'POWER',   color: [200, 60, 60], stroke: '#FF4444', glow: 'rgba(255, 68, 68, 0.3)' },
            { key: 'SKILLS',  label: 'SKILLS',  color: [140, 80, 200], stroke: '#AA66FF', glow: 'rgba(170, 102, 255, 0.3)' },
        ];

        const tabCount = tabs.length;
        const tabSpacing = 5;
        const totalAvailable = shopWidth - (tabSpacing * (tabCount - 1));
        const tabWidth = Math.floor(totalAvailable / tabCount);
        const tabHeight = 28;
        const totalTabsWidth = (tabWidth * tabCount) + (tabSpacing * (tabCount - 1));
        const tabStartX = shopX + (shopWidth - totalTabsWidth) / 2;
        const tabCorner = 5;

        this.shopTabBounds = {};

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const tx = tabStartX + i * (tabWidth + tabSpacing);
            const isActive = this.shopCategory === tab.key;
            const isHovered = this.mouseX >= tx && this.mouseX <= tx + tabWidth &&
                              this.mouseY >= tabY && this.mouseY <= tabY + tabHeight;

            const [r, g, b] = tab.color;
            let fillStyle;
            if (isActive) fillStyle = `rgba(${r}, ${g}, ${b}, 1.0)`;
            else if (isHovered) fillStyle = `rgba(${Math.round(r*0.78)}, ${Math.round(g*0.78)}, ${Math.round(b*0.78)}, 0.95)`;
            else fillStyle = `rgba(${Math.round(r*0.55)}, ${Math.round(g*0.55)}, ${Math.round(b*0.55)}, 0.85)`;

            this.ctx.save();
            if (isHovered && !isActive) {
                this.ctx.shadowColor = tab.glow;
                this.ctx.shadowBlur = 6;
            }
            this.ctx.fillStyle = fillStyle;
            this.ctx.strokeStyle = tab.stroke;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.roundRect(tx, tabY, tabWidth, tabHeight, tabCorner);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();

            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = 'bold 10px "Press Start 2P", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(tab.label, tx + tabWidth / 2, tabY + tabHeight / 2);

            this.shopTabBounds[tab.key.toLowerCase()] = { x: tx, y: tabY, width: tabWidth, height: tabHeight };
        }
    }

export function drawShopItem(item, x, y, width, height, index, isHovered = false) {
        const currentStacks = this.player.getPowerupStacks(item.id);

        // Determine item state for weapons/skills vs regular items
        const isWeaponOrSkill = item.isWeapon || item.isSkill;
        const isOwned = item.owned || (isWeaponOrSkill && currentStacks > 0);
        const isEquipped = item.equipped;
        const isFree = item.currency === 'FREE';

        // Calculate dynamic cost for special items
        let actualCost = item.cost;
        if (item.costOverrides) {
            actualCost = item.costOverrides[Math.min(currentStacks, item.costOverrides.length - 1)] || item.cost;
        } else if (item.id === 'CHARGE_SPEED') {
            if (currentStacks === 0) actualCost = 1500;
            else if (currentStacks === 1) actualCost = 3000;
            else if (currentStacks === 2) actualCost = 5000;
        }

        let canAfford, maxedOut;
        if (isWeaponOrSkill) {
            // Weapons/skills: can only buy once, then it's "equip"
            maxedOut = isOwned && isEquipped;
            if (isOwned) {
                canAfford = true; // can always equip an owned weapon
            } else if (isFree) {
                canAfford = true;
            } else if (item.spCost && item.spCost > 0) {
                // Weapon costs both coins and SP
                canAfford = this.game.money >= actualCost && this.player.skillPoints >= item.spCost;
            } else {
                canAfford = item.currency === 'SP' ?
                    this.player.skillPoints >= actualCost :
                    this.game.money >= actualCost;
            }
        } else {
            canAfford = item.currency === 'SP' ?
                this.player.skillPoints >= actualCost :
                this.game.money >= actualCost;
            maxedOut = currentStacks >= item.maxStacks;
        }

        // Item background — rounded corners
        const itemCorner = 8;
        if (isWeaponOrSkill && isEquipped) {
            // Equipped weapon: cyan/blue highlight
            this.ctx.fillStyle = isHovered ? 'rgba(0, 180, 255, 0.5)' : 'rgba(0, 140, 200, 0.35)';
        } else if (isWeaponOrSkill && isOwned) {
            // Owned but not equipped: dimmer green
            this.ctx.fillStyle = isHovered ? 'rgba(0, 200, 100, 0.4)' : 'rgba(0, 150, 80, 0.25)';
        } else if (maxedOut) {
            this.ctx.fillStyle = isHovered ? 'rgba(150, 150, 150, 0.6)' : 'rgba(100, 100, 100, 0.5)';
        } else if (canAfford) {
            this.ctx.fillStyle = isHovered ? 'rgba(0, 255, 0, 0.4)' : 'rgba(0, 255, 0, 0.2)';
        } else {
            this.ctx.fillStyle = isHovered ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 0, 0, 0.2)';
        }
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, itemCorner);
        this.ctx.fill();

        // Item border with hover glow
        this.ctx.save();
        if (isHovered && !maxedOut) {
            this.ctx.shadowColor = (isWeaponOrSkill && isEquipped) ? 'rgba(0, 180, 255, 0.6)' :
                                   canAfford ? 'rgba(0, 255, 136, 0.6)' : 'rgba(255, 68, 68, 0.6)';
            this.ctx.shadowBlur = 14;
        }
        if (isWeaponOrSkill && isEquipped) {
            this.ctx.strokeStyle = isHovered ? '#44DDFF' : '#00AADD';
        } else {
            this.ctx.strokeStyle = isHovered
                ? (maxedOut ? '#AAAAAA' : (canAfford ? '#00FF88' : '#FF4444'))
                : (maxedOut ? '#666666' : (canAfford ? '#00FF00' : '#FF0000'));
        }
        this.ctx.lineWidth = isHovered ? 3 : 2;
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, itemCorner);
        this.ctx.stroke();
        this.ctx.restore();

        // Horizontal layout for list items
        const iconSize = 32;
        const padding = 15;
        const iconAreaWidth = iconSize + padding;

        // Item icon
        this.ctx.font = `${iconSize}px "Press Start 2P", monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = maxedOut ? '#666' : '#FFFFFF';
        const iconCenterX = x + padding + iconAreaWidth / 2;
        this.ctx.fillText(item.icon, iconCenterX, y + height / 2 + iconSize / 4 - 10);

        // Text content area (right of icon area)
        const textX = x + padding + iconAreaWidth + padding;
        const costAreaWidth = 100;
        const textWidth = width - (padding + iconAreaWidth + padding + costAreaWidth + padding);

        // Item name
        this.ctx.font = 'bold 16px "Press Start 2P", monospace';
        this.ctx.fillStyle = maxedOut ? '#666' : '#FFFFFF';
        this.ctx.textAlign = 'left';

        const nameLines = item.name.split('\n');
        const nameLineHeight = 18;

        nameLines.forEach((line, idx) => {
            let displayLine = line;
            let lw = this.ctx.measureText(displayLine).width;
            if (lw > textWidth) {
                while (lw > textWidth - 30 && displayLine.length > 3) {
                    displayLine = displayLine.slice(0, -1);
                    lw = this.ctx.measureText(displayLine + '...').width;
                }
                displayLine += '...';
            }
            this.ctx.fillText(displayLine, textX, y + 32 + (idx * nameLineHeight));
        });

        // Item description
        this.ctx.font = '12px "Press Start 2P", monospace';
        this.ctx.fillStyle = maxedOut ? '#666' : '#CCCCCC';
        this.ctx.textAlign = 'left';

        const maxDescLines = 2;
        const lineHeight = 16;
        const descStartY = y + 66;

        this.drawMultilineText(item.description, textX, descStartY, textWidth, lineHeight, maxDescLines);

        // Cost / status (right side)
        const costX = x + width - padding;
        this.ctx.font = 'bold 16px "Press Start 2P", monospace';

        if (isWeaponOrSkill) {
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            if (isEquipped) {
                this.ctx.fillStyle = '#44DDFF';
                this.ctx.fillText('EQUIPPED', costX, y + 35);
            } else if (isOwned) {
                this.ctx.fillStyle = '#44FF88';
                this.ctx.font = 'bold 14px "Press Start 2P", monospace';
                this.ctx.fillText('EQUIP', costX, y + 35);
            } else if (isFree) {
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.fillText('FREE', costX, y + 35);
            } else {
                // Show dual cost: coins + SP
                const costCenterY = y + 28;
                if (actualCost > 0) {
                    this.ctx.fillStyle = (this.game.money >= actualCost) ? '#FFD700' : '#FF6666';
                    this.ctx.textAlign = 'right';
                    const costStr = `${actualCost}`;
                    const costTextW = this.ctx.measureText(costStr).width;
                    const coinIconSz = 18;
                    const coinIconGp = 4;
                    drawCachedMoneyIcon(this.ctx, costX - costTextW - coinIconGp - coinIconSz / 2, costCenterY, coinIconSz, '#FFD700', '#B8860B');
                    this.ctx.fillText(costStr, costX, costCenterY);
                }
                if (item.spCost && item.spCost > 0) {
                    this.ctx.fillStyle = (this.player.skillPoints >= item.spCost) ? '#4A90E2' : '#FF6666';
                    this.ctx.textAlign = 'right';
                    this.ctx.font = 'bold 14px "Press Start 2P", monospace';
                    this.ctx.fillText(`${item.spCost} SP`, costX, y + 50);
                }
            }
        } else if (item.currency === 'SP') {
            this.ctx.fillStyle = canAfford ? '#4A90E2' : '#FF6666';
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`${actualCost} SP`, costX, y + 35);
        } else {
            const costCenterY = y + 35;
            this.ctx.textBaseline = 'middle';
            this.ctx.textAlign = 'right';
            this.ctx.fillStyle = canAfford ? '#FFD700' : '#FF6666';
            const costStr = `${actualCost}`;
            const costTextWidth = this.ctx.measureText(costStr).width;
            const coinIconSize = 20;
            const coinIconGap = 5;
            const coinIconX = costX - costTextWidth - coinIconGap - coinIconSize / 2;
            drawCachedMoneyIcon(this.ctx, coinIconX, costCenterY, coinIconSize, '#FFD700', '#B8860B');
            this.ctx.fillText(costStr, costX, costCenterY);
        }

        // Level/status beneath cost (right side)
        this.ctx.font = '10px "Press Start 2P", monospace';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'alphabetic';
        if (isWeaponOrSkill) {
            if (isOwned && !isEquipped) {
                this.ctx.fillStyle = '#44FF88';
                this.ctx.fillText('OWNED', costX, y + 72);
            }
        } else {
            this.ctx.fillStyle = maxedOut ? '#666' : '#00FFFF';
            this.ctx.fillText(`Level ${currentStacks}`, costX, y + 72);
        }

        // Sell button — only for regular items with stacks, and for weapon upgrades
        if (!isWeaponOrSkill && currentStacks > 0) {
            let sellCost = item.cost;
            if (item.costOverrides) {
                sellCost = item.costOverrides[Math.min(currentStacks - 1, item.costOverrides.length - 1)] || item.cost;
            } else if (item.id === 'CHARGE_SPEED') {
                if (currentStacks === 1) sellCost = 1500;
                else if (currentStacks === 2) sellCost = 3000;
                else sellCost = 5000;
            }
            const refund = Math.floor(sellCost * 0.5);
            const sellLabel = item.currency === 'SP' ? `SELL +${refund}SP` : `SELL +${refund}`;

            const sbW = 80, sbH = 18;
            const sbX = costX - sbW;
            const sbY = y + height - sbH - 6;

            const sellHovered = this.mouseX !== undefined &&
                this.mouseX >= sbX && this.mouseX <= sbX + sbW &&
                this.mouseY >= sbY && this.mouseY <= sbY + sbH;

            this.ctx.save();
            this.ctx.fillStyle = sellHovered ? 'rgba(220,80,80,0.9)' : 'rgba(160,40,40,0.7)';
            this.ctx.beginPath();
            this.ctx.roundRect(sbX, sbY, sbW, sbH, 4);
            this.ctx.fill();
            this.ctx.strokeStyle = sellHovered ? '#ff9999' : '#993333';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.roundRect(sbX, sbY, sbW, sbH, 4);
            this.ctx.stroke();
            this.ctx.font = '8px "Press Start 2P", monospace';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(sellLabel, sbX + sbW / 2, sbY + sbH / 2);
            this.ctx.restore();

            if (!this.shopSellButtonBounds) this.shopSellButtonBounds = [];
            this.shopSellButtonBounds.push({ x: sbX, y: sbY, w: sbW, h: sbH, itemId: item.id });
        }

        // Store item bounds for click detection
        if (!this.shopItemBounds) this.shopItemBounds = [];
        this.shopItemBounds[index] = { x, y, width, height, item };
    }

export function drawMultilineText(text, x, startY, maxWidth, lineHeight, maxLines = null) {
        const words = text.split(' ');
        let line = '';
        let y = startY;
        let lineCount = 0;

        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const metrics = this.ctx.measureText(testLine);
            const testWidth = metrics.width;

            if (testWidth > maxWidth && i > 0) {
                // Check if we've hit max lines
                if (maxLines && lineCount >= maxLines - 1) {
                    // Truncate with ellipsis
                    let truncatedLine = line.trim();
                    while (this.ctx.measureText(truncatedLine + '...').width > maxWidth && truncatedLine.length > 0) {
                        truncatedLine = truncatedLine.slice(0, -1);
                    }
                    this.ctx.fillText(truncatedLine + '...', x, y);
                    return;
                }

                // Draw the current line and start a new one
                this.ctx.fillText(line.trim(), x, y);
                line = words[i] + ' ';
                y += lineHeight;
                lineCount++;
            } else {
                line = testLine;
            }
        }

        // Draw the last line if we haven't hit max lines
        if (line.trim().length > 0 && (!maxLines || lineCount < maxLines)) {
            this.ctx.fillText(line.trim(), x, y);
        }
    }
