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
        setTitle("Neon Asteroids Java");
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
    private boolean[] teclas; // Para manejo suave de teclado
    
    // Estado del Juego
    private int score;
    private int vidas;
    private boolean gameOver;

    public GamePanel() {
        setBackground(Color.BLACK);
        setFocusable(true);
        addKeyListener(this);
        
        teclas = new boolean[256]; // Array para guardar estado de teclas
        initGame();
        
        // Game Loop: ~60 FPS (16ms)
        timer = new Timer(16, this);
        timer.start();
    }

    private void initGame() {
        nave = new Nave(400, 300);
        asteroides = new ArrayList<>();
        balas = new ArrayList<>();
        score = 0;
        vidas = 3;
        gameOver = false;
        
        // Crear algunos asteroides iniciales
        for (int i = 0; i < 5; i++) {
            asteroides.add(new Asteroide());
        }
    }

    @Override
    public void paintComponent(Graphics g) {
        super.paintComponent(g);
        Graphics2D g2d = (Graphics2D) g;

        // Activar Antialiasing para bordes suaves (estilo vector/neon)
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        if (gameOver) {
            drawGameOver(g2d);
        } else {
            drawGame(g2d);
            drawHUD(g2d);
        }
        
        Toolkit.getDefaultToolkit().sync(); // Sincronizar para animación fluida en Linux/Mac
    }

    private void drawGame(Graphics2D g2d) {
        nave.draw(g2d);
        
        for (Asteroide a : asteroides) {
            a.draw(g2d);
        }
        
        for (Bala b : balas) {
            b.draw(g2d);
        }
    }

    private void drawHUD(Graphics2D g2d) {
        g2d.setColor(Color.WHITE);
        g2d.setFont(new Font("Monospaced", Font.BOLD, 18));
        g2d.drawString("PUNTOS: " + score, 20, 30);
        g2d.drawString("VIDAS: " + vidas, 20, 50);
    }

    private void drawGameOver(Graphics2D g2d) {
        String msg = "GAME OVER";
        String scoreMsg = "Puntuación Final: " + score;
        String restartMsg = "Presiona ENTER para reiniciar";
        
        g2d.setColor(Color.RED);
        g2d.setFont(new Font("Monospaced", Font.BOLD, 40));
        FontMetrics fm = g2d.getFontMetrics();
        g2d.drawString(msg, (getWidth() - fm.stringWidth(msg)) / 2, getHeight() / 2 - 40);
        
        g2d.setColor(Color.WHITE);
        g2d.setFont(new Font("Monospaced", Font.PLAIN, 20));
        fm = g2d.getFontMetrics();
        g2d.drawString(scoreMsg, (getWidth() - fm.stringWidth(scoreMsg)) / 2, getHeight() / 2 + 10);
        g2d.drawString(restartMsg, (getWidth() - fm.stringWidth(restartMsg)) / 2, getHeight() / 2 + 40);
    }

    @Override
    public void actionPerformed(ActionEvent e) {
        if (!gameOver) {
            updateShip();
            updateBullets();
            updateAsteroids();
            checkCollisions();
        }
        repaint();
    }

    private void updateShip() {