// ==UserScript==
// @name         Medula Otomatik Reçete Aktarıcı
// @namespace    https://github.com/Bluetwinklez/eczane-etiket
// @version      1.0
// @description  Medula Eczane reçetelerini tek tıkla Eczane İlaç Etiketi Programına aktarır.
// @author       Eczane Etiket
// @match        https://medula.sgk.gov.tr/*
// @match        http://medula.sgk.gov.tr/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    function sendToLabelApp() {
        const text = document.body ? document.body.innerText : '';
        if (!text || text.length < 20) {
            alert("Sayfa içeriği okunamadı.");
            return;
        }

        GM_xmlhttpRequest({
            method: "POST",
            url: "http://127.0.0.1:18888/medula",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
            data: text,
            onload: function (response) {
                try {
                    const data = JSON.parse(response.responseText);
                    showNotification("✓ " + data.message, "#16a34a");
                } catch (e) {
                    showNotification("✓ Reçete Eczane Etiket Programına aktarıldı!", "#16a34a");
                }
            },
            onerror: function () {
                showNotification("⚠️ Eczane Etiket Programı açık değil! Lütfen programı başlatın.", "#dc2626");
            }
        });
    }

    function showNotification(msg, color) {
        const toast = document.createElement("div");
        toast.innerText = msg;
        toast.style.position = "fixed";
        toast.style.top = "20px";
        toast.style.right = "20px";
        toast.style.zIndex = "1000000";
        toast.style.backgroundColor = color;
        toast.style.color = "#ffffff";
        toast.style.padding = "12px 20px";
        toast.style.borderRadius = "8px";
        toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
        toast.style.fontSize = "14px";
        toast.style.fontWeight = "bold";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // Medula sayfasına yüzen buton ekle
    window.addEventListener("load", function () {
        const btn = document.createElement("button");
        btn.id = "btn-medula-etiket-aktar";
        btn.innerHTML = "🏷️ <b>Etiket Yazdır</b>";
        btn.title = "Reçetedeki ilaçları Eczane Etiket Programına aktar";
        btn.style.position = "fixed";
        btn.style.bottom = "24px";
        btn.style.right = "24px";
        btn.style.zIndex = "999999";
        btn.style.padding = "12px 22px";
        btn.style.backgroundColor = "#2563eb";
        btn.style.color = "#ffffff";
        btn.style.border = "2px solid #ffffff";
        btn.style.borderRadius = "30px";
        btn.style.boxShadow = "0 6px 16px rgba(37,99,235,0.4)";
        btn.style.fontSize = "14px";
        btn.style.cursor = "pointer";
        btn.style.fontWeight = "bold";
        btn.style.fontFamily = "sans-serif";
        btn.onclick = sendToLabelApp;
        document.body.appendChild(btn);
    });
})();
