document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.share-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.shareUrl || location.href;
      const title = btn.dataset.shareTitle || document.title;

      if (navigator.share) {
        try {
          await navigator.share({ title, url });
        } catch (e) {
          // user cancelled the share sheet; nothing to do
        }
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        const original = btn.textContent;
        btn.textContent = 'Link copied!';
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 2000);
      } catch (e) {
        // clipboard unavailable in this context; leave the button as-is
      }
    });
  });
});
