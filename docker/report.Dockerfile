# One-shot job: regenerate analysis/credit_card_analysis.xlsx from the live Excel data.
FROM python:3.12-slim
RUN pip install --no-cache-dir pandas==2.2.3 openpyxl==3.1.5
WORKDIR /work
COPY scripts/build_excel_analysis.py /opt/build_excel_analysis.py
ENTRYPOINT ["python", "/opt/build_excel_analysis.py"]
CMD ["/work/data/credit_card_customers.xlsx", "/work/analysis/credit_card_analysis.xlsx"]
