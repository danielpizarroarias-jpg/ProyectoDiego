package com.mycompany.proyectodiego;

import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.awt.geom.Path2D;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.Random;

public class ProyectoDiego extends JFrame {

    public ProyectoDiego() {
        initUI();
    }

    private void initUI() {
        add(new GamePanel());
        setTitle("Neon Asteroids - Java Edition");
        setSize(800, 600);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);
        setResizable(false);
    }

    public static void main(String[] args) {
        EventQueue.invokeLater(() -> {
            ProyectoDiego ex = new ProyectoDiego();
            ex.setVisible(true);
        });
    }
}

class GamePanel extends JPanel implements ActionListener, KeyListener {

    private Timer timer;
    private Nave nave;
    private ArrayList<Asteroide> asteroides;
    private ArrayList<Bala> balas;
    private boolean[] teclas;
    
    // --- VARIABLES DE PROGRESO ---
    private int score;
    private int vidas;
    private int nivel;          // Nivel actual
    private int levelTimer;     // Para mostrar mensaje de "NIVEL X"
    private boolean gameOver;

    public GamePanel() {
        setBackground(Color.BLACK);
        setFocusable(true);
        addKeyListener(this);
        
        teclas = new boolean[256];
        initGame();
        
        timer = new Timer(16, this); // ~60 FPS
        timer.start();
    }

    private void initGame() {
        nave = new Nave(400, 300);
        asteroides = new ArrayList<>();
        balas = new ArrayList<>();
        score = 0;
        vidas = 3;
        nivel = 1;
        levelTimer = 0;
        gameOver = false;
        
        startLevel();
    }

    // Lógica para iniciar un nivel
    private void startLevel() {
        asteroides.clear();
        balas.clear();
        nave.reset(getWidth(), getHeight()); // Resetear posición nave (seguridad)
        
        // DIFICULTAD PROGRESIVA:
        // Cantidad: 3 base + 1 por nivel (Nivel 1 = 4, Nivel 2 = 5...)
        int cantidad = 3 + nivel;
        // Velocidad: Aumenta un 10% cada nivel
        double multiplicadorVelocidad = 1.0 + (nivel * 0.1);

        for (int i = 0; i < cantidad; i++) {
            asteroides.add(new Asteroide(multiplicadorVelocidad));
        }
        
        // Mostrar mensaje de nivel durante 2 segundos (120 frames)
        levelTimer = 120; 
    }

    @Override
    public void paintComponent(Graphics g) {
        super.paintComponent(g);
        Graphics2D g2d = (Graphics2D) g;
        
        // Antialiasing para gráficos suaves
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        if (gameOver) {
            drawGameOver(g2d);
        } else {
            drawGame(g2d);
            drawHUD(g2d);
            
            // Dibujar mensaje de "NIVEL X" si está activo
            if (levelTimer > 0) {
                g2d.setColor(new Color(0, 255, 255, Math.min(255, levelTimer * 5))); // Efecto desvanecimiento
                g2d.setFont(new Font("Monospaced", Font.BOLD, 60));
                String msg = "NIVEL " + nivel;
                FontMetrics fm = g2d.getFontMetrics();
                g2d.drawString(msg, (getWidth() - fm.stringWidth(msg)) / 2, getHeight() / 2 - 50);
                levelTimer--;
            }
        }
        Toolkit.getDefaultToolkit().sync();
    }

    private void drawGame(Graphics2D g2d) {
        nave.draw(g2d);
        for (Asteroide a : asteroides) a.draw(g2d);
        for (Bala b : balas) b.draw(g2d);
    }

    private void drawHUD(Graphics2D g2d) {
        g2d.setColor(Color.WHITE);
        g2d.setFont(new Font("Monospaced", Font.BOLD, 18));
        g2d.drawString("PUNTOS: " + score, 20, 30);
        g2d.drawString("VIDAS: " + vidas, 20, 50);
        g2d.drawString("NIVEL: " + nivel, getWidth() - 120, 30);
    }

    private void drawGameOver(Graphics2D g2d) {
        String msg = "GAME OVER";
        String scoreMsg = "Puntuación Final: " + score;
        String levelMsg = "Alcanzaste el Nivel " + nivel;
        String restartMsg = "Presiona ENTER para reiniciar";
        
        g2d.setColor(Color.RED);
        g2d.setFont(new Font("Monospaced", Font.BOLD, 40));
        FontMetrics fm = g2d.getFontMetrics();
        int cx = getWidth() / 2;
        int cy = getHeight() / 2;
        
        g2d.drawString(msg, cx - fm.stringWidth(msg) / 2, cy - 60);
        
        g2d.setColor(Color.WHITE);
        g2d.setFont(new Font("Monospaced", Font.PLAIN, 20));
        fm = g2d.getFontMetrics();
        g2d.drawString(scoreMsg, cx - fm.stringWidth(scoreMsg) / 2, cy);
        g2d.drawString(levelMsg, cx - fm.stringWidth(levelMsg) / 2, cy + 30);
        g2d.drawString(restartMsg, cx - fm.stringWidth(restartMsg) / 2, cy + 70);
    }

    @Override
    public void actionPerformed(ActionEvent e) {
        if (!gameOver) {
            updateShip();
            updateBullets();
            updateAsteroids();
            checkCollisions();
            checkLevelUp(); // Chequear si pasamos de nivel
        }
        repaint();
    }

    private void checkLevelUp() {
        if (asteroides.isEmpty()) {
            nivel++;
            startLevel(); // Inicia el siguiente nivel con más dificultad
        }
    }

    private void updateShip() {
        if (teclas[KeyEvent.VK_LEFT]) nave.rotate(-0.08);
        if (teclas[KeyEvent.VK_RIGHT]) nave.rotate(0.08);
        nave.setThrusting(teclas[KeyEvent.VK_UP]);
        nave.update(getWidth(), getHeight());
    }

    private void updateBullets() {
        Iterator<Bala> it = balas.iterator();
        while (it.hasNext()) {
            Bala b = it.next();
            b.update(getWidth(), getHeight());
            if (!b.isAlive()) it.remove();
        }
    }

    private void updateAsteroids() {
        for (Asteroide a : asteroides) {
            a.update(getWidth(), getHeight());
        }
    }

    private void checkCollisions() {
        Iterator<Bala> itBala = balas.iterator();
        while (itBala.hasNext()) {
            Bala b = itBala.next();
            Iterator<Asteroide> itAst = asteroides.iterator();
            boolean hit = false;
            
            while (itAst.hasNext()) {
                Asteroide a = itAst.next();
                if (b.getBounds().intersects(a.getBounds())) {
                    itAst.remove();
                    hit = true;
                    
                    // --- LÓGICA DE PUNTUACIÓN ---
                    // Más puntos cuanto más pequeño es el asteroide
                    if (a.size > 40) score += 20;       // Grande
                    else if (a.size > 20) score += 50;  // Mediano
                    else score += 100;                  // Pequeño
                    
                    // Dividir asteroide
                    if (a.size > 20) {
                        // Los hijos heredan el multiplicador de velocidad del padre
                        asteroides.add(new Asteroide(a.x, a.y, a.size / 2, a.speedMult * 1.2)); 
                        asteroides.add(new Asteroide(a.x, a.y, a.size / 2, a.speedMult * 1.2));
                    }
                    break; 
                }
            }
            if (hit) itBala.remove();
        }

        if (!nave.isInvulnerable()) {
            for (Asteroide a : asteroides) {
                double dist = Math.sqrt(Math.pow(nave.x - a.x, 2) + Math.pow(nave.y - a.y, 2));
                if (dist < (nave.r + a.size * 0.8)) {
                    vidas--;
                    nave.reset(getWidth() / 2, getHeight() / 2); // Respawn centro
                    if (vidas <= 0) gameOver = true;
                    break; 
                }
            }
        }
    }

    @Override
    public void keyPressed(KeyEvent e) {
        int key = e.getKeyCode();
        if (key < 256) teclas[key] = true;
        if (key == KeyEvent.VK_SPACE && !gameOver) balas.add(nave.shoot());
        if (key == KeyEvent.VK_ENTER && gameOver) initGame();
    }

    @Override
    public void keyReleased(KeyEvent e) {
        int key = e.getKeyCode();
        if (key < 256) teclas[key] = false;
    }
    @Override public void keyTyped(KeyEvent e) {}
}

// --- CLASES DE ENTIDADES ---

class Nave {
    double x, y, vx, vy, angle;
    int r = 15;
    boolean thrusting;
    int invulnerableTimer = 0;

    public Nave(double x, double y) {
        this.x = x; this.y = y;
        this.angle = -Math.PI / 2;
    }

    public void update(int w, int h) {
        if (thrusting) {
            vx += Math.cos(angle) * 0.2;
            vy += Math.sin(angle) * 0.2;
        }
        vx *= 0.99; vy *= 0.99;
        x += vx; y += vy;
        
        if (x < 0) x = w; else if (x > w) x = 0;
        if (y < 0) y = h; else if (y > h) y = 0;
        
        if (invulnerableTimer > 0) invulnerableTimer--;
    }

    public void draw(Graphics2D g) {
        if (invulnerableTimer > 0 && (invulnerableTimer / 10) % 2 == 0) return;

        g.setColor(Color.CYAN);
        g.setStroke(new BasicStroke(2));
        Path2D path = new Path2D.Double();
        path.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
        path.lineTo(x - r * (Math.cos(angle) + Math.sin(angle)), y - r * (Math.sin(angle) - Math.cos(angle)));
        path.lineTo(x - r * (Math.cos(angle) - Math.sin(angle)), y - r * (Math.sin(angle) + Math.cos(angle)));
        path.closePath();
        g.draw(path);
        
        if (thrusting) {
            g.setColor(Color.ORANGE);
            g.drawLine((int)(x - r * Math.cos(angle)), (int)(y - r * Math.sin(angle)),
                       (int)(x - (r+10) * Math.cos(angle)), (int)(y - (r+10) * Math.sin(angle)));
        }
    }

    public void rotate(double da) { angle += da; }
    public void setThrusting(boolean t) { thrusting = t; }
    public Bala shoot() { return new Bala(x + r * Math.cos(angle), y + r * Math.sin(angle), angle); }
    public boolean isInvulnerable() { return invulnerableTimer > 0; }
    
    public void reset(double startX, double startY) {
        // En Java Swing el centro puede variar, pasamos coordenadas
        // Si startX es muy grande, asumimos centro por defecto si no se calcula bien fuera
        if (startX > 2000) startX = 400; 
        x = startX / 2; 
        y = startY / 2; 
        vx = 0; vy = 0;
        invulnerableTimer = 150; // 2.5 segundos de protección
    }
}

class Bala {
    double x, y, vx, vy;
    int life = 60;

    public Bala(double x, double y, double angle) {
        this.x = x; this.y = y;
        this.vx = Math.cos(angle) * 7;
        this.vy = Math.sin(angle) * 7;
    }

    public void update(int w, int h) {
        x += vx; y += vy;
        life--;
        if (x < 0) x = w; else if (x > w) x = 0;
        if (y < 0) y = h; else if (y > h) y = 0;
    }

    public void draw(Graphics2D g) {
        g.setColor(Color.YELLOW);
        g.fillOval((int)x - 2, (int)y - 2, 4, 4);
    }
    public boolean isAlive() { return life > 0; }
    public Rectangle getBounds() { return new Rectangle((int)x-2, (int)y-2, 4, 4); }
}

class Asteroide {
    double x, y, vx, vy, size;
    double speedMult; // Multiplicador de velocidad
    int[] xPoints, yPoints;
    int nPoints;

    // Constructor para inicio de nivel (posición aleatoria en bordes)
    public Asteroide(double speedMult) {
        this.speedMult = speedMult;
        this.size = 40 + Math.random() * 20; // Tamaño entre 40 y 60
        
        // Spawnear en los bordes para no matar al jugador instantáneamente
        if (Math.random() < 0.5) {
            this.x = Math.random() < 0.5 ? 0 : 800;
            this.y = Math.random() * 600;
        } else {
            this.x = Math.random() * 800;
            this.y = Math.random() < 0.5 ? 0 : 600;
        }

        setVelocity();
        generateShape();
    }

    // Constructor para fragmentos (posición heredada)
    public Asteroide(double x, double y, double size, double speedMult) {
        this.x = x; this.y = y; this.size = size; this.speedMult = speedMult;
        setVelocity();
        generateShape();
    }
    
    private void setVelocity() {
        // Velocidad base * Multiplicador de nivel
        this.vx = (Math.random() - 0.5) * 3 * speedMult;
        this.