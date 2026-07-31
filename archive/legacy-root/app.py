import os
import numpy as np
import pandas as pd
import yfinance as yf
from dash import Dash, dcc, html, Input, Output
import plotly.graph_objects as go
import pickle

# Load S&P Constituents
with open('s_pconstituents.pkl', 'rb') as f:
    spdr = pickle.load(f)

# # List of files
# files = [f'target_prices/{i}' for i in os.listdir('target_prices')]

with open('top_paths.txt', 'r') as f:
    files = [line.strip() for line in f.readlines()]



# Define classification and color mapping functions
def classify_price_target(row):
    if row['Lower_1SD'] <= row['Price_Target'] <= row['Upper_1SD']:
        return 'Between ±1SD'
    elif row['Upper_1SD'] < row['Price_Target'] <= row['Upper_2SD']:
        return 'Between +1SD and +2SD'
    elif row['Lower_2SD'] <= row['Price_Target'] < row['Lower_1SD']:
        return 'Between -2SD and -1SD'
    elif row['Price_Target'] > row['Upper_2SD']:
        return 'Above +2SD'
    elif row['Price_Target'] < row['Lower_2SD']:
        return 'Below -2SD'
    else:
        return 'Undefined'

def map_bin_to_color(bins):
    color_map = {
        'Below -2SD': 'purple',
        'Above +2SD': 'red',
        'Between +1SD and +2SD': 'orange',
        'Between ±1SD': 'green',
        'Between -2SD and -1SD': 'blue',
        'Undefined': 'white'
    }
    return color_map[bins]

# Dash App
app = Dash(__name__)

# Layout
app.layout = html.Div([
    html.H1("Binned Price Targets (S&P 500)", style={'text-align': 'center'}),
    dcc.Dropdown(
        id='file-selector',
        options=[
            {'label': spdr[file.split('/')[1].split('.')[0]], 'value': file}
            for file in files if file.split('/')[1].split('.')[0] in spdr
        ],
        value=files[0] if files[0].split('/')[1].split('.')[0] in spdr else None,  # Default selection if valid
        placeholder="Select a company"
    ),
    dcc.Graph(id='price-target-plot')
])



# Callback
@app.callback(
    Output('price-target-plot', 'figure'),
    Input('file-selector', 'value')
)
def update_plot(selected_file):
    # Load data for the selected file
    X = pd.read_pickle(selected_file)
    X.columns = ['ticker', 'est', 'date']
    X['est'] = X['est'].replace("", np.nan)
    X = X.dropna()

    ticker = selected_file.split('/')[1][:-4]
    price = yf.download(ticker, start=X.date.min(), end=X.date.max())
    X['date'] = pd.to_datetime(X['date'].dt.date)
    X = X.sort_values(by='date')
    stock = price.reset_index()
    stock = stock[['Date', 'Close']]
    stock.columns = ['date', 'price']
    stock = stock.set_index('date')
    stock = stock.reindex(pd.date_range(stock.index.min(), stock.index.max())).ffill().reset_index().rename(columns={'index': 'date'})
    X = pd.merge(X, stock, on='date', how='left')
    X.rename(columns={
        'price': 'Close',
        'est': 'Price_Target'
    }, inplace=True)

    # Calculate SD bands
    X["Upper_1SD"] = X["Close"] + X["Close"] * 0.1
    X["Lower_1SD"] = X["Close"] - X["Close"] * 0.1
    X["Upper_2SD"] = X["Close"] + 2 * X["Close"] * 0.1
    X["Lower_2SD"] = X["Close"] - 2 * X["Close"] * 0.1
    X['Bin'] = X.apply(classify_price_target, axis=1)
    X['color'] = X['Bin'].apply(map_bin_to_color)

    # Create the plot
    fig = go.Figure()

    # Scatter for price targets
    fig.add_trace(go.Scatter(
        x=X['date'],
        y=X['Price_Target'],
        mode='markers',
        marker=dict(color=X['color']),
        name='Price Targets'
    ))

    # Line for actual price
    fig.add_trace(go.Scatter(
        x=X['date'],
        y=X['Close'],
        mode='lines',
        line=dict(color='black', width=2),
        name='Actual Price'
    ))

    # # SD Lines
    # fig.add_trace(go.Scatter(
    #     x=X['date'],
    #     y=X['Upper_1SD'],
    #     mode='lines',
    #     line=dict(color='grey', dash='dash'),
    #     name='10%'
    # ))
    # fig.add_trace(go.Scatter(
    #     x=X['date'],
    #     y=X['Lower_1SD'],
    #     mode='lines',
    #     line=dict(color='grey', dash='dash'),
    #     name=''
    # ))
    fig.add_trace(go.Scatter(
        x=X['date'],
        y=X['Upper_2SD'],
        mode='lines',
        line=dict(color='grey', dash='dash'),
        name='20%'
    ))
    fig.add_trace(go.Scatter(
        x=X['date'],
        y=X['Lower_2SD'],
        mode='lines',
        line=dict(color='grey', dash='dash'),
        name=''
    ))

    # Layout
    fig.update_layout(
        title=f'Price Targets and Actual Prices for {spdr[ticker]}',
        xaxis_title='Date',
        yaxis_title='Price',
        template='plotly_white'
    )

    return fig

# Run server
if __name__ == '__main__':
    app.run_server(debug=True)
