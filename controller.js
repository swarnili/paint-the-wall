

const input = {
    x: 512,
    y: 320,
    pressed: false,
    dx: 0,
    dy: 0
};
window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();

    input.x = (e.clientX - rect.left) *
              (canvas.width / rect.width);

    input.y = (e.clientY - rect.top) *
              (canvas.height / rect.height);
});

window.addEventListener('mousedown', () => {
    input.pressed = true;
});

window.addEventListener('mouseup', () => {
    input.pressed = false;
});