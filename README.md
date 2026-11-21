# SFU Grade Calculator

Track your SFU course grades and term GPA. 

## Features

- Semesters, each with as many courses as you want, each with as many assignments as you want
- Enter grades as `85`, `85%` or `17/20`
- Letter grade from the SIAT recommended scale, with cutoffs you can edit per course (for example, A+ from 96 in MATH 251) or for every course at once
- TGPA weighted by units, using SFU grade points (A+ 4.33 down to F 0)
- Target letter per course: shows the average you need on the remaining weight, plus what you'd need for every other letter
- Semester goal: compares your TGPA with the goal, shows a projected TGPA if you hit your course targets, and can apply the goal to every course
- CGPA after the term, from your current CGPA and units done
- Export/import a JSON backup; open tabs stay in sync

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Grading scale used

| Letter | SIAT min % | Grade points |
|---|---|---|
| A+ | 95 | 4.33 |
| A | 90 | 4.00 |
| A- | 85 | 3.67 |
| B+ | 80 | 3.33 |
| B | 75 | 3.00 |
| B- | 70 | 2.67 |
| C+ | 65 | 2.33 |
| C | 60 | 2.00 |
| C- | 55 | 1.67 |
| D | 50 | 1.00 |
| F | below 50 | 0.00 |

SIAT's percentages are a recommendation. Instructors can use their own, so check each syllabus and edit that course's cutoffs.

Your data lives only in the browser you use. It won't follow you to another device unless you export and import a backup.
