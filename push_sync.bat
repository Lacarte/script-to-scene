@echo off
echo --- Staging all changes ---
git add .

echo --- Committing changes ---
:: Using a generic message since analysis script couldn't run
git commit -m "chore: save progress and sync to remote"

echo --- Setting up remote ---
:: execution might fail if origin already exists, which is fine
git remote add origin https://github.com/Lacarte/script-to-scene.git

echo --- Renaming branch to main ---
git branch -M main

echo --- Pushing to origin ---
git push -u origin main

echo --- Done ---
pause
