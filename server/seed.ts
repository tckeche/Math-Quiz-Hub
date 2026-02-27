import { storage } from "./storage";

export async function seedDatabase() {
  const existing = await storage.getSomaQuizzes();
  if (existing.length > 0) return;

  await storage.createSomaQuizBundle({
    quiz: {
      title: "Pure Mathematics — Paper 1",
      topic: "Algebra, Calculus, Sequences, and Coordinate Geometry",
      syllabus: "IEB",
      level: "Grade 12",
      subject: "Mathematics",
      status: "published",
    },
    questions: [
      {
        stem: "Solve the equation \\(x^2 - 5x + 6 = 0\\).",
        options: ["\\(x = 1, 6\\)", "\\(x = 2, 3\\)", "\\(x = -2, -3\\)", "\\(x = -1, 6\\)"],
        correctAnswer: "\\(x = 2, 3\\)",
        explanation: "Factoring: (x-2)(x-3) = 0, so x = 2 or x = 3.",
        marks: 3,
      },
      {
        stem: "Find \\(\\frac{d}{dx}(3x^3 - 2x^2 + 7x - 4)\\).",
        options: ["\\(9x^2 - 4x + 7\\)", "\\(9x^2 - 2x + 7\\)", "\\(3x^2 - 4x + 7\\)", "\\(9x^3 - 4x^2 + 7\\)"],
        correctAnswer: "\\(9x^2 - 4x + 7\\)",
        explanation: "Apply the power rule to each term.",
        marks: 4,
      },
      {
        stem: "Evaluate \\(\\int_0^2 (2x + 1)\\,dx\\).",
        options: ["\\(5\\)", "\\(6\\)", "\\(7\\)", "\\(8\\)"],
        correctAnswer: "\\(6\\)",
        explanation: "Integrate to get x² + x, evaluate from 0 to 2: (4+2) - 0 = 6.",
        marks: 4,
      },
      {
        stem: "The first three terms of a geometric sequence are \\(2, 6, 18\\). Find the 5th term.",
        options: ["\\(54\\)", "\\(162\\)", "\\(486\\)", "\\(108\\)"],
        correctAnswer: "\\(162\\)",
        explanation: "Common ratio r = 3. 5th term = 2 × 3⁴ = 162.",
        marks: 3,
      },
      {
        stem: "Find the equation of the line passing through \\((1, 3)\\) and \\((4, 9)\\).",
        options: ["\\(y = 2x + 1\\)", "\\(y = 3x\\)", "\\(y = 2x + 3\\)", "\\(y = x + 2\\)"],
        correctAnswer: "\\(y = 2x + 1\\)",
        explanation: "Slope = (9-3)/(4-1) = 2. Using point (1,3): y - 3 = 2(x - 1), so y = 2x + 1.",
        marks: 3,
      },
    ],
  });

  await storage.createSomaQuizBundle({
    quiz: {
      title: "Statistics & Probability — Paper 2",
      topic: "Probability, Mean, Standard Deviation",
      syllabus: "IEB",
      level: "Grade 12",
      subject: "Mathematics",
      status: "published",
    },
    questions: [
      {
        stem: "A fair six-sided die is rolled once. What is the probability of getting an even number?",
        options: ["\\(\\frac{1}{6}\\)", "\\(\\frac{1}{3}\\)", "\\(\\frac{1}{2}\\)", "\\(\\frac{2}{3}\\)"],
        correctAnswer: "\\(\\frac{1}{2}\\)",
        explanation: "Even numbers: 2, 4, 6 — that's 3 out of 6 = 1/2.",
        marks: 2,
      },
      {
        stem: "The mean of the data set \\(\\{4, 7, 10, 13, 16\\}\\) is:",
        options: ["\\(8\\)", "\\(9\\)", "\\(10\\)", "\\(11\\)"],
        correctAnswer: "\\(10\\)",
        explanation: "Sum = 50, count = 5, mean = 50/5 = 10.",
        marks: 2,
      },
      {
        stem: "If \\(P(A) = 0.3\\) and \\(P(B) = 0.5\\), and \\(A\\) and \\(B\\) are independent, find \\(P(A \\cap B)\\).",
        options: ["\\(0.15\\)", "\\(0.80\\)", "\\(0.20\\)", "\\(0.35\\)"],
        correctAnswer: "\\(0.15\\)",
        explanation: "For independent events: P(A ∩ B) = P(A) × P(B) = 0.3 × 0.5 = 0.15.",
        marks: 3,
      },
      {
        stem: "The standard deviation of the data set \\(\\{2, 4, 4, 4, 5, 5, 7, 9\\}\\) is approximately:",
        options: ["\\(1.5\\)", "\\(2.0\\)", "\\(2.5\\)", "\\(3.0\\)"],
        correctAnswer: "\\(2.0\\)",
        explanation: "Mean = 5, variance = 4, standard deviation = √4 = 2.0.",
        marks: 3,
      },
    ],
  });

  console.log("Database seeded with sample soma quizzes and questions.");
}
