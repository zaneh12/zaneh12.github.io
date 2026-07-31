import dash
from dash import dcc, html
from dash.dependencies import Input, Output
import numpy as np
import plotly.express as px
import pandas as pd
from sklearn.preprocessing import LabelEncoder
from sklearn.preprocessing import OneHotEncoder

label_encoder = LabelEncoder()

app = dash.Dash(__name__)

# Generate random data
np.random.seed(0)
data = np.arange(0,10001,1)
ydata = np.concatenate([np.random.beta(1,2,200),
                        np.random.beta(5,1,200),
                        np.random.beta(1,4,200),
                        np.random.beta(1,1,200),
                        np.random.beta(5,54,200)]) 
bins = label_encoder.fit_transform(pd.cut(ydata, 5, retbins=True)[0])
# Create the initial scatter plot

bin_color_map = {
    0: 'blue',
    1: 'green',
    2: 'red',
    3: 'purple',
    4: 'orange',
}

scatter_colors = [bin_color_map[bin] for bin in bins]

scatter_data = {
    'x': data,
    'y': ydata,  # Use both x and y values
    'mode': 'markers',
    'type': 'scatter',
    'marker': {'color': scatter_colors, 
                'size': 10},
}

# Initialize the vertical line trace
vertical_line = {
    'x': [0, 0],
    'y': [0, 1],
    'type': 'scatter',
    'mode': 'lines',
    'line': {'color': 'red', 'width': 4}
}

# Define custom colors for the bins
bin_colors = ['red', 'green', 'blue', 'purple', 'orange']

app.layout = html.Div([
    html.Div([
        dcc.Graph(id='scatter-plot', config={'displayModeBar': False}),
    ]),
    html.Div([
        dcc.Graph(id='left-bar-plot'),
        dcc.Graph(id='right-bar-plot'),
        dcc.Graph(id='line-plot'),  # Added a third line chart
    ], style={'display': 'flex'}),
    dcc.Slider(
        id='slider',
        min=0,
        max=1000,
        step=25,
        value=500,
        # marks={i: str(i) for i in range(-3, 4)}
    ),
])

@app.callback(
    Output('scatter-plot', 'figure'),
    Output('left-bar-plot', 'figure'),
    Output('right-bar-plot', 'figure'),
    Output('line-plot', 'figure'),  # Updated the callback to include the line chart
    Input('slider', 'value')
)
def update_plots(slider_value):
    # Update the vertical line trace for the scatter plot
    vertical_line_scatter = {
        'x': [slider_value, slider_value],
        'y': [0, 1],
        'type': 'scatter',
        'mode': 'lines',
        'line': {'color': 'red', 'width': 4}
    }
    # Assign colors to the data points based on the bins
    # bin_colors = np.digitize(bins, np.linspace(0, 5, 6)) - 1

    # Update the left bar chart with counts to the left of the slider
    left_counts = np.histogram(bins[:slider_value], bins=5, range=(0, 5))[0]
    left_bar_fig = px.bar(x=np.unique(bins), 
                          y=left_counts, 
                          labels={'x': 'Bins', 'y': 'Counts'},
                          width = 666,
                          title='Counts to the Left of Slider')
    right_colors = ['blue', 'green', 'red', 'purple', 'orange']
    left_bar_fig.update_traces(marker_color=right_colors)


    # Update the right bar chart with counts to the right of the slider
    right_counts = np.histogram(bins[slider_value:], bins=5, range=(0, 5))[0]
    right_bar_fig =  px.bar(x=np.unique(bins), 
                            y=right_counts, 
                            labels={'x': 'Bins', 'y': 'Counts'},
                            width = 666,
                            title='Counts to the Left of Slider')
    
    right_colors = ['blue', 'green', 'red', 'purple', 'orange']
    right_bar_fig.update_traces(marker_color=right_colors)
    # right_bar_fig.update_traces(marker_color=[bin_colors], marker_cmin=0, marker_cmax=4, opacity=0.7)

    # Update the vertical line trace
    vertical_line['x'] = [slider_value, slider_value]

    # Create scatter plot with different colors for the bins
    scatter_fig = {
        'data': [scatter_data, vertical_line],  # Add the vertical line trace
        'layout': {'title': 'Scatter Plot of Binned Data',
                   'width' : 2000,
                   'legend': {'title': 'Bins'}
                   }
    }
    # Create a line chart
    x_line = np.arange(0,1001,40)
    y_line = np.sin(x_line)
     # Update the vertical line trace for the line plot
    vertical_line_line = {
        'x': [slider_value, slider_value],
        'y': [-1, 1],  # Adjust the y-values as needed for the line plot
        'type': 'scatter',
        'mode': 'lines',
        'line': {'color': 'red', 'width': 4}
    }

    # Add the vertical lines to the line plot
    line_data = {
        'x': x_line,
        'y': y_line,
        'mode': 'lines',
        'type': 'scatter',
    }

    line_fig = {
        'data': [line_data, vertical_line_line],  # Include the vertical line trace
        'layout': {'title': 'Line Chart',
                   'width':600}
    }

    return scatter_fig, left_bar_fig, right_bar_fig, line_fig

if __name__ == '__main__':
    app.run_server(debug=True)
