# Dating Profile Intelligence

NLP powered user segmentation and profile similarity, using OKCupid profiles.

**Answer.** What people write in a dating profile carries real but limited information about how they live. Essays predict a drinking habit better than guessing (macro F1 of 0.386 against 0.212 on a held out test set) and find similar profiles slightly better than chance, but user segments are only weakly separated, and the data cannot show whether two people would match.

## Question

A new user on a dating platform has no history, so the platform has only the profile to work with, and many profiles are incomplete. How much can the profile text and lifestyle answers tell us? The project asks three questions:

1. **Segmentation.** Can meaningful user groups be discovered from profile descriptions, interests and lifestyle information?
2. **Prediction.** Can drinking preferences be predicted from other profile attributes, and does clustering improve predictive performance?
3. **Similarity.** Can NLP identify profiles with similar characteristics, and how do TF-IDF and sentence embeddings compare?

## Data

A teaching file of 59,946 OkCupid profiles with 31 columns: multiple choice answers and ten short essays. It appears to be the educational dataset by Albert Y. Kim and Adriana Escobedo-Land (2015, https://github.com/rudeboybert/JSE_OkCupid), scraped from public profiles in June 2012 around San Francisco. Profiles were last online between June 2011 and July 2012, and 99.8% are in California. Each row is one user.

The authors obtained OkCupid's permission to share the data for teaching. No source says that the individual users agreed. **The data is not included in this repository.** The project uses it for education only, treats all text as personal, and reports aggregates only: no essay text and no individual profile rows are displayed. Orientation, religion and ethnicity were excluded as prediction targets and as model inputs. See the model card in Section 14.2 of the notebook.

## Approach

* **Clean, then split once.** Fixed cleaning rules, then a stratified split with seed 42: 45,568 training users and 11,393 test users. A further 2,985 users without a drinks answer are used only for unsupervised work.
* **Training data only.** Exploration, hypothesis tests, preprocessing and model fitting use the training set. Everything that learns from data sits inside a scikit-learn pipeline.
* **Text.** Essays are cleaned of markup and contact details, then represented with TF-IDF and with sentence embeddings (`all-MiniLM-L6-v2`, run on the local computer).
* **Segmentation.** K-means on reduced embeddings and lifestyle answers, with the number of groups chosen by stability.
* **Prediction.** The target is the drinking habit in four groups. A baseline, logistic regression, Naive Bayes and gradient boosting are compared with 5 fold cross validation. The test set is used once, for the final model and the baseline.
* **Similarity.** Nearest neighbours by cosine similarity, evaluated by whether neighbours share lifestyle answers that the search never saw, compared with chance.

## Results

**Drinking prediction (test set, 11,393 users)**
* Final model, logistic regression on structured fields and TF-IDF text: macro F1 of **0.386** (95% range 0.376 to 0.397).
* Baseline that always predicts the most common answer, "socially": **0.212**.
* Accuracy is 0.517 against 0.734 for the baseline. This is deliberate: the model gives up accuracy on the large group to find the small ones.
* The model finds 54% of social drinkers, 53% of users who drink often, 41% of rare drinkers and 40% of non drinkers. Precision for the three small groups is only 0.17 to 0.28.

**What carries the signal (validation, training set, 5 folds)**
* Structured fields alone: 0.317. Essay text alone: 0.351. Both together: 0.387.
* Adding the user segment changes the score by -0.0017, which is within the noise. Clustering does not help prediction.

**Segmentation**
* Six segments are stable (agreement of 0.98 across new random starts and 0.97 across new samples) but only weakly separated (silhouette score about 0.05). Users form a continuum, so the segments describe tendencies, not distinct types.
* Two segments split almost completely by sex (91% and 18% men) although sex was not used. Writing style acts as a proxy.

**Profile similarity**
* With sentence embeddings, neighbours share lifestyle answers 2.2 to 4.8 points more often than chance on all nine fields tested, for example job (12.6% agreement against 8.2%).
* For drinking the margin is small: 60.3% with embeddings, 57.5% with TF-IDF and 56.4% by chance.
* Embeddings were better for similarity, and TF-IDF was better for prediction.

**Fairness checks (test set)**
* Macro F1 is 0.393 for women and 0.381 for men, 0.327 for users aged 45 and over, and 0.275 for users with no text.

## Limitations

* The data is from California in 2011 and 2012, answers are self reported, and `sex` has two values.
* There are no matches, messages or ratings, so similarity is evaluated with a proxy. Nothing here shows that similar profiles would match.
* Results are associations, not causes. The fairness checks are not a full audit.
* The drinking model is wrong for many individuals and should not be used to profile anyone.

## Responsible use

This is an educational project. It is not suitable for profiling users, for inferring orientation, religion, ethnicity or any other sensitive trait, for treating users differently by segment, for decisions about an individual, or for describing a similarity score as compatibility. The prohibited uses are listed in the model card.

## Reproduce

The notebook was run with Python 3.12 on an Apple M1 Max. Package versions used: pandas 3.1.1, numpy 2.5.4, scikit-learn 1.9.1, matplotlib 3.11.2, seaborn 0.13.2, scipy 1.18.1 and sentence-transformers 6.3.0. These versions are pinned in `requirements.txt`.

1. Create the environment:

   ```
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Put the data file `profiles.csv` in the project folder. It is not included. It is the original 2015 version of the dataset above, as supplied with a data science course exercise. The authors' 2021 revision will not reproduce the results, because it removes location and last online, adds noise to age and shuffles the essays so that they no longer match the profiles.

3. Open `okcupid_profile_intelligence.ipynb` with the kernel of that environment, and run all cells. Start JupyterLab from the activated environment with `jupyter lab` and choose "Python 3 (ipykernel)". In an editor, select the interpreter `.venv/bin/python` as the kernel, and check that it is the `.venv` inside this folder and not another environment. To run it without opening it, from the activated environment:

   ```
   jupyter nbconvert --to notebook --execute --ExecutePreprocessor.timeout=7200 okcupid_profile_intelligence.ipynb --output run.ipynb
   ```

**What to expect**
* The random seed is 42, so results repeat on the same computer.
* As an example, a clean run took about 16 minutes with five parallel workers. The time will differ on other computers.
* The parallel workers need about 2 GB of memory each. On a computer with little memory, lower `N_JOBS` in the parameters cell (Section 3.2).
* The first run downloads the embedding model, about 90 MB, from the Hugging Face hub, so it needs an internet connection. The text is never sent anywhere.

## Project files

* `okcupid_profile_intelligence.ipynb`: the complete analysis in 15 sections, from the problem and ethics to the model card and future work.
* `requirements.txt`: the packages the notebook needs, with the versions used.
* `LICENSE`: the MIT licence for the code and text in this repository.
* `.gitignore`: keeps the data, model files, local environments and private notes out of the repository.
* `README.md`: this file.

## Licence

The original code and text in this repository are released under the MIT licence (see `LICENSE`). The data is not included and is not covered by it. No licence is stated for the data. Its authors obtained OkCupid's permission to share it for teaching, on the condition that it remains public, and no source says that the individual users agreed, so check the terms of wherever you obtain the file before any use. The packages and the embedding model (`all-MiniLM-L6-v2`, Apache 2.0) keep their own licences.

## Status

The notebook is complete. A slide deck and an interactive application are planned: profile discovery with explanations as the central function, and a separate educational page for the drinking model. Neither exists yet.
